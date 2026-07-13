import AsyncStorage from "@react-native-async-storage/async-storage";
import { RidePoint } from "../types";
import { normalizeFiniteCoordinate } from "../utils/coordinates";
import { optionalFiniteNumber } from "../utils/normalize";
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
  const point = normalizeRidePoint(firstPoint);
  if (!point) {
    throw new Error("A valid first location point is required to start a ride");
  }

  await enqueueWrite(async () => {
    await AsyncStorage.multiSet([
      [MANUAL_TRACKING_ACTIVE_KEY, "true"],
      [
        MANUAL_RIDE_SESSION_KEY,
        JSON.stringify({
          startedAt: point.recordedAt,
          updatedAt: point.recordedAt,
          points: [point]
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
    if (!merged.length) {
      return;
    }

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
  const normalized = dedupeRidePoints(points);
  if (maxPoints <= 1) {
    return normalized.slice(0, 1);
  }
  if (normalized.length <= maxPoints) {
    return normalized;
  }

  const result: RidePoint[] = [];
  const step = (normalized.length - 1) / (maxPoints - 1);
  for (let index = 0; index < maxPoints; index += 1) {
    result.push(normalized[Math.round(index * step)]);
  }
  return dedupeRidePoints(result);
}

export function dedupeRidePoints(points: RidePoint[]) {
  const seen = new Set<string>();
  return points
    .map(normalizeRidePoint)
    .filter((point): point is RidePoint => Boolean(point))
    .sort((a, b) => timestampMs(a.recordedAt) - timestampMs(b.recordedAt))
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
  const points = Array.isArray(parsed.points) ? dedupeRidePoints(parsed.points) : [];
  if (!points.length) {
    return null;
  }

  return {
    startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : points[0].recordedAt,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : points[points.length - 1].recordedAt,
    points
  };
}

async function readBackgroundPoints(): Promise<RidePoint[]> {
  try {
    const stored = await AsyncStorage.getItem(BACKGROUND_POINTS_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? dedupeRidePoints(parsed) : [];
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

function normalizeRidePoint(point: any): RidePoint | null {
  if (!point) {
    return null;
  }

  const coordinate = normalizeFiniteCoordinate(point);
  if (!coordinate) {
    return null;
  }

  const recordedAt = typeof point.recordedAt === "string" && Number.isFinite(Date.parse(point.recordedAt))
    ? point.recordedAt
    : new Date().toISOString();

  return {
    ...coordinate,
    altitudeM: optionalFiniteNumber(point.altitudeM),
    accuracyM: optionalFiniteNumber(point.accuracyM),
    speedKmh: optionalFiniteNumber(point.speedKmh),
    recordedAt
  };
}

function timestampMs(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}
