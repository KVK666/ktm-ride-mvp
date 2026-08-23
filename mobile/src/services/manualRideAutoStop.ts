import AsyncStorage from "@react-native-async-storage/async-storage";
import { RidePoint } from "../types";
import { evaluateManualRideAutoStop } from "../utils/manualRideAutoStopPolicy";
import { diagnosticDetails, logDiagnostic } from "./diagnostics";
import { clearManualRideSession, readMergedManualRideSession } from "./manualRideSession";
import { createRideClientId, queuePendingRide, RideUploadPayload, uploadRidePayload } from "./rideUpload";
import { MANUAL_AUTO_STOP_NOTICE_KEY, MIRRORED_TOKEN_KEY } from "./trackingKeys";

export type ManualAutoStopCompletionStatus = "saved" | "queued" | "too-short";

export type ManualAutoStopNotice = {
  status: ManualAutoStopCompletionStatus;
  endedAt: string;
};

export type ManualAutoStopResult =
  | { status: "active" | "inactive" }
  | ({ status: ManualAutoStopCompletionStatus; points: RidePoint[]; endedAt: string })
  | { status: "failed"; message: string };

let autoStopFinalization: Promise<ManualAutoStopResult> | null = null;

export function evaluateAndFinalizeManualRideAutoStop(): Promise<ManualAutoStopResult> {
  if (autoStopFinalization) {
    return autoStopFinalization;
  }

  autoStopFinalization = evaluateAndFinalizeManualRideAutoStopOnce().finally(() => {
    autoStopFinalization = null;
  });
  return autoStopFinalization;
}

export async function consumeManualAutoStopNotice(): Promise<ManualAutoStopNotice | null> {
  try {
    const stored = await AsyncStorage.getItem(MANUAL_AUTO_STOP_NOTICE_KEY);
    if (!stored) {
      return null;
    }
    await AsyncStorage.removeItem(MANUAL_AUTO_STOP_NOTICE_KEY);
    const parsed = JSON.parse(stored);
    if (!isCompletionStatus(parsed?.status) || !isValidDate(parsed?.endedAt)) {
      return null;
    }
    return { status: parsed.status, endedAt: parsed.endedAt };
  } catch (err) {
    await logDiagnostic({
      level: "warn",
      area: "manual-ride",
      message: "Manual auto-stop notice could not be read",
      details: diagnosticDetails(err)
    });
    return null;
  }
}

export async function clearManualAutoStopNotice() {
  try {
    await AsyncStorage.removeItem(MANUAL_AUTO_STOP_NOTICE_KEY);
  } catch (err) {
    await logDiagnostic({
      level: "warn",
      area: "manual-ride",
      message: "Manual auto-stop notice could not be cleared",
      details: diagnosticDetails(err)
    });
  }
}

export function isManualAutoStopComplete(
  result: ManualAutoStopResult
): result is Extract<ManualAutoStopResult, { status: ManualAutoStopCompletionStatus }> {
  return isCompletionStatus(result.status);
}

async function evaluateAndFinalizeManualRideAutoStopOnce(): Promise<ManualAutoStopResult> {
  const session = await readMergedManualRideSession();
  if (!session?.points.length) {
    return { status: "inactive" };
  }

  const decision = evaluateManualRideAutoStop(session.points, session.startedAt);
  if (!decision.shouldStop) {
    return { status: "active" };
  }

  if (decision.points.length < 2) {
    try {
      await clearManualRideSession();
      await storeCompletionNotice("too-short", decision.endedAt);
      await logDiagnostic({
        level: "info",
        area: "manual-ride",
        message: "Manual ride auto-stopped and discarded as too short"
      });
      return { status: "too-short", points: decision.points, endedAt: decision.endedAt };
    } catch (err) {
      return failedResult(err);
    }
  }

  const payload = createManualRidePayload(decision.points, session.startedAt, decision.endedAt);
  let completionStatus: ManualAutoStopCompletionStatus;
  try {
    const token = await AsyncStorage.getItem(MIRRORED_TOKEN_KEY);
    if (token) {
      try {
        await uploadRidePayload(payload, token);
        completionStatus = "saved";
      } catch (uploadError) {
        await queuePendingRide(payload);
        completionStatus = "queued";
        await logDiagnostic({
          level: "warn",
          area: "manual-ride",
          message: "Auto-stopped manual ride queued after upload failure",
          details: diagnosticDetails(uploadError)
        });
      }
    } else {
      await queuePendingRide(payload);
      completionStatus = "queued";
    }

    await clearManualRideSession();
    await storeCompletionNotice(completionStatus, decision.endedAt);
    await logDiagnostic({
      level: "info",
      area: "manual-ride",
      message: completionStatus === "saved"
        ? "Manual ride automatically stopped and uploaded"
        : "Manual ride automatically stopped and saved locally",
      details: `endedAt=${decision.endedAt} points=${decision.points.length}`
    });
    return {
      status: completionStatus,
      points: decision.points,
      endedAt: decision.endedAt
    };
  } catch (err) {
    return failedResult(err);
  }
}

function createManualRidePayload(points: RidePoint[], startedAt: string, endedAt: string): RideUploadPayload {
  return {
    clientRideId: createRideClientId("manual", startedAt, endedAt, points),
    startLabel: "Start point",
    endLabel: "End point",
    startedAt,
    endedAt,
    points
  };
}

async function storeCompletionNotice(status: ManualAutoStopCompletionStatus, endedAt: string) {
  try {
    await AsyncStorage.setItem(
      MANUAL_AUTO_STOP_NOTICE_KEY,
      JSON.stringify({ status, endedAt } satisfies ManualAutoStopNotice)
    );
  } catch (err) {
    await logDiagnostic({
      level: "warn",
      area: "manual-ride",
      message: "Manual auto-stop notice could not be saved",
      details: diagnosticDetails(err)
    });
  }
}

async function failedResult(err: unknown): Promise<ManualAutoStopResult> {
  await logDiagnostic({
    level: "error",
    area: "manual-ride",
    message: "Manual ride auto-stop could not be saved",
    details: diagnosticDetails(err)
  });
  return {
    status: "failed",
    message: "Ride appears stopped, but it could not be saved yet. Recording will continue so the route is not lost."
  };
}

function isCompletionStatus(value: unknown): value is ManualAutoStopCompletionStatus {
  return value === "saved" || value === "queued" || value === "too-short";
}

function isValidDate(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
