import { RidePoint } from "../types";
import { distanceMeters } from "./distance";

export const MANUAL_AUTO_STOP_SPEED_KMH = 5;
export const MANUAL_AUTO_STOP_DURATION_MS = 5 * 60 * 1000;

const MAX_REASONABLE_REPORTED_SPEED_KMH = 250;
const MAX_REPORTED_SPEED_ACCURACY_M = 35;
const MAX_MOVEMENT_POINT_GAP_MS = 5 * 60 * 1000;
const MIN_MOVEMENT_DISTANCE_M = 10;

export type ManualRideAutoStopDecision =
  | {
      shouldStop: false;
      lastMovingAt: string;
      stoppedForMs: number;
    }
  | {
      shouldStop: true;
      endedAt: string;
      points: RidePoint[];
      stoppedForMs: number;
    };

export function evaluateManualRideAutoStop(
  points: RidePoint[],
  startedAt: string
): ManualRideAutoStopDecision {
  const ordered = [...points]
    .filter((point) => timestampMs(point.recordedAt) > 0)
    .sort((a, b) => timestampMs(a.recordedAt) - timestampMs(b.recordedAt));
  const safeStartedAt = timestampMs(startedAt) > 0
    ? startedAt
    : ordered[0]?.recordedAt || new Date(0).toISOString();

  if (!ordered.length) {
    return { shouldStop: false, lastMovingAt: safeStartedAt, stoppedForMs: 0 };
  }

  let lastMovingIndex = 0;
  for (let index = 1; index < ordered.length; index += 1) {
    if (hasMeaningfulMovement(ordered[index - 1], ordered[index])) {
      lastMovingIndex = index;
    }
  }

  const lastMovingAt = ordered[lastMovingIndex]?.recordedAt || safeStartedAt;
  const latestAt = ordered[ordered.length - 1]?.recordedAt || lastMovingAt;
  const stoppedForMs = Math.max(0, timestampMs(latestAt) - timestampMs(lastMovingAt));
  if (stoppedForMs < MANUAL_AUTO_STOP_DURATION_MS) {
    return { shouldStop: false, lastMovingAt, stoppedForMs };
  }

  return {
    shouldStop: true,
    endedAt: lastMovingAt,
    points: ordered.slice(0, lastMovingIndex + 1),
    stoppedForMs
  };
}

function hasMeaningfulMovement(previous: RidePoint, current: RidePoint) {
  const reportedSpeedKmh = reliableReportedSpeed(current);
  const previousAt = timestampMs(previous.recordedAt);
  const currentAt = timestampMs(current.recordedAt);
  const gapMs = currentAt - previousAt;
  if (gapMs <= 0 || gapMs > MAX_MOVEMENT_POINT_GAP_MS) {
    return reportedSpeedKmh > MANUAL_AUTO_STOP_SPEED_KMH;
  }

  const distanceM = distanceMeters(previous, current);
  const inferredSpeedKmh = Number.isFinite(distanceM)
    ? (distanceM / 1000) / (gapMs / (60 * 60 * 1000))
    : 0;
  return (
    reportedSpeedKmh > MANUAL_AUTO_STOP_SPEED_KMH ||
    inferredSpeedKmh > MANUAL_AUTO_STOP_SPEED_KMH ||
    distanceM >= MIN_MOVEMENT_DISTANCE_M
  );
}

function reliableReportedSpeed(point: RidePoint) {
  const speedKmh = Number(point.speedKmh);
  if (!Number.isFinite(speedKmh) || speedKmh < 0 || speedKmh > MAX_REASONABLE_REPORTED_SPEED_KMH) {
    return 0;
  }
  if (point.accuracyM != null && point.accuracyM > MAX_REPORTED_SPEED_ACCURACY_M) {
    return 0;
  }
  return speedKmh;
}

function timestampMs(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}
