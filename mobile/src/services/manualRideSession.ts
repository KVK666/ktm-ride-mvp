import AsyncStorage from "@react-native-async-storage/async-storage";
import { RidePoint } from "../types";
import { diagnosticDetails, logDiagnostic } from "./diagnostics";
import {
  BACKGROUND_POINTS_KEY,
  MANUAL_RIDE_SESSION_KEY,
  MANUAL_TRACKING_ACTIVE_KEY
} from "./trackingKeys";

export type ManualRideSession = {
  startedAt: string;
  updatedAt: string;
  points: RidePoint[];
};

const MAX_STORED_MANUAL_POINTS = 12000;
const MAX_MAP_POINTS = 900;

let writeQueue: Promise<unknown> = Promise.resolve();

export async function startManualRideSession(firstPoint: RidePoint) {
  await enqueueWrite(async () => {
    await AsyncStorage.multiSet([
      [MANUAL_TRACKING_ACTIVE_KEY, "true"],
      [
        MANUAL_RIDE_SESSION_KEY,
        JSON.stringify({
          startedAt: firstPoint.recordedAt,
          updatedAt: firstPoint.recordedAt,
          points: [firstPoint]
        } satisfies ManualRideSession)
      ]
    ]);
  });
}

export async function appendManualRidePoints(points: RidePoint[]) {
  if (!points.length) {
    return;
  }

  await enqueueWrite(async () => {
    const current = await readManualRideSessionUnsafe();
    if (!current) {
      return;
    }
    const merged = dedupeRidePoints([...current.points, ...points]).slice(-MAX_STORED_MANUAL_POINTS);
    await AsyncStorage.setItem(
      MANUAL_RIDE_SESSION_KEY,
      JSON.stringify({
        startedAt: current.startedAt,
        updatedAt: merged[merged.length - 1]?.recordedAt || new Date().toISOString(),
        points: merged
      } satisfies ManualRideSession)
    );
  });
}

export async function readMergedManualRideSession(): Promise<ManualRideSession | null> {
  const [session, backgroundPoints] = await Promise.all([
    readManualRideSession(),
    readBackgroundPoints()
  ]);

  const points = dedupeRidePoints([...(session?.points || []), ...backgroundPoints]);
  if (!points.length && !session) {
    return null;
  }

  return {
    startedAt: session?.startedAt || points[0].recordedAt,
    updatedAt: points[points.length - 1]?.recordedAt || session?.updatedAt || new Date().toISOString(),
    points
  };
}

export async function hasManualRideSession() {
  const session = await readMergedManualRideSession();
  return Boolean(session?.points.length);
}

export async function clearManualRideSession() {
  await enqueueWrite(async () => {
    await AsyncStorage.multiRemove([
      MANUAL_RIDE_SESSION_KEY,
      BACKGROUND_POINTS_KEY,
      MANUAL_TRACKING_ACTIVE_KEY
    ]);
  });
}

export function compactRidePointsForMap(points: RidePoint[], maxPoints = MAX_MAP_POINTS) {
  if (points.length <= maxPoints) {
    return points;
  }

  const result: RidePoint[] = [];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let index = 0; index < maxPoints; index += 1) {
    result.push(points[Math.round(index * step)]);
  }
  return dedupeRidePoints(result);
}

export function dedupeRidePoints(points: RidePoint[]) {
  const seen = new Set<string>();
  return points
    .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && point.recordedAt)
    .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime())
    .filter((point) => {
      const key = `${point.recordedAt}-${point.latitude.toFixed(7)}-${point.longitude.toFixed(7)}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

async function readManualRideSession(): Promise<ManualRideSession | null> {
  try {
    return await readManualRideSessionUnsafe();
  } catch (err) {
    await logDiagnostic({
      level: "error",
      area: "manual-ride",
      message: "Manual ride session could not be read",
      details: diagnosticDetails(err)
    });
    return null;
  }
}

async function readManualRideSessionUnsafe(): Promise<ManualRideSession | null> {
  const stored = await AsyncStorage.getItem(MANUAL_RIDE_SESSION_KEY);
  if (!stored) {
    return null;
  }
  const parsed = JSON.parse(stored) as ManualRideSession;
  return {
    startedAt: parsed.startedAt,
    updatedAt: parsed.updatedAt || parsed.points?.[parsed.points.length - 1]?.recordedAt || parsed.startedAt,
    points: Array.isArray(parsed.points) ? parsed.points : []
  };
}

async function readBackgroundPoints(): Promise<RidePoint[]> {
  try {
    const stored = await AsyncStorage.getItem(BACKGROUND_POINTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (err) {
    await logDiagnostic({
      level: "error",
      area: "manual-ride",
      message: "Manual background points could not be read",
      details: diagnosticDetails(err)
    });
    return [];
  }
}

function enqueueWrite<T>(operation: () => Promise<T>) {
  const next = writeQueue.then(operation, operation);
  writeQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}
