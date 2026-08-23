import { Coordinate } from "../types";
import { normalizeBoundedCoordinate } from "./coordinates";
import { distanceMeters } from "./distance";

export const NORMALIZED_REPLAY_DURATION_MS = 24000;
export const REPLAY_SPEEDS = [0.5, 1, 2] as const;

export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];
export type ReplaySource = "recorded" | "imported" | "unknown";
export type ReplayTiming = "recorded" | "estimated" | "unavailable";

/**
 * The API has historically returned recorded points, while importers can add
 * route/track arrays without changing the shared Ride contract. Keep that
 * compatibility local to the replay feature.
 */
export type ReplayRideInput = {
  points?: readonly ReplayPointInput[] | null;
  routePreview?: readonly ReplayPointInput[] | null;
  coordinates?: readonly ReplayPointInput[] | null;
  route?: readonly ReplayPointInput[] | null;
  track?: readonly ReplayPointInput[] | null;
  trackPoints?: readonly ReplayPointInput[] | null;
  gpsPoints?: readonly ReplayPointInput[] | null;
  path?: readonly ReplayPointInput[] | null;
  durationS?: unknown;
  startedAt?: unknown;
  endedAt?: unknown;
  source?: unknown;
  rideSource?: unknown;
  importSource?: unknown;
  origin?: unknown;
  importId?: unknown;
  sourceSegmentIds?: unknown;
  clientRideId?: unknown;
  distanceM?: unknown;
  avgSpeedKmh?: unknown;
  topSpeedKmh?: unknown;
  speedDataQuality?: unknown;
  sourceActivityType?: unknown;
  activityType?: unknown;
  activity?: unknown;
  rideKind?: unknown;
  imported?: unknown;
  isImported?: unknown;
};

export type ReplayPointInput = {
  latitude?: unknown;
  longitude?: unknown;
  lat?: unknown;
  lng?: unknown;
  lon?: unknown;
  recordedAt?: unknown;
  timestamp?: unknown;
  timestampMs?: unknown;
  time?: unknown;
  at?: unknown;
  date?: unknown;
} | readonly unknown[];

export type ReplayPoint = Coordinate & {
  elapsedS: number;
  timestampMs: number | null;
};

type ReplayPointWithCoordinate = {
  coordinate: Coordinate;
  timestampMs: number | null;
};

export type RouteReplayModel = {
  points: ReplayPoint[];
  coordinates: Coordinate[];
  source: ReplaySource;
  timing: ReplayTiming;
  durationS: number | null;
  startedAtMs: number | null;
  endedAtMs: number | null;
  canReplay: boolean;
};

export type ReplayPosition = {
  coordinate: Coordinate | null;
  traveledCoordinates: Coordinate[];
  untraveledCoordinates: Coordinate[];
  elapsedS: number;
  actualAtMs: number | null;
};

export type ReplaySpeedQuality = "measured" | "estimated" | "unavailable";

export type ReplayFacts = {
  distanceM: number | null;
  durationS: number | null;
  activityLabel: string;
  sourceLabel: string;
  pointCount: number;
  averageSpeedKmh: number | null;
  peakSpeedKmh: number | null;
  speedQuality: ReplaySpeedQuality;
};

export function buildRouteReplayModel(input?: ReplayRideInput | null): RouteReplayModel {
  const ride = input || {};
  const source = detectReplaySource(ride);
  const rawPoints = findRoutePoints(ride);
  const points = rawPoints
    .map((point) => {
      const coordinate = normalizeReplayCoordinate(point);
      return coordinate ? { coordinate, timestampMs: readPointTimestamp(point) } : null;
    })
    .filter((point): point is { coordinate: Coordinate; timestampMs: number | null } => point != null);
  const coordinates = points.map((point) => point.coordinate);
  const rideDurationS = positiveSeconds(ride.durationS);
  const rideStartMs = readTimestamp(ride.startedAt);
  const rideEndMs = readTimestamp(ride.endedAt);
  const timed = points.filter((point) => point.timestampMs != null);
  const timedStartMs = timed.length ? timed[0].timestampMs : null;
  const timedEndMs = timed.length ? timed[timed.length - 1].timestampMs : null;
  const pointSpanS = timedStartMs != null && timedEndMs != null && timedEndMs > timedStartMs
    ? (timedEndMs - timedStartMs) / 1000
    : null;
  const actualStartMs = rideStartMs ?? timedStartMs;
  const actualEndMs = rideEndMs ?? timedEndMs;
  const actualDurationS = actualStartMs != null && actualEndMs != null && actualEndMs > actualStartMs
    ? (actualEndMs - actualStartMs) / 1000
    : pointSpanS;

  if (points.length < 2) {
    return {
      points: points.map((point) => createReplayPoint(point, 0)),
      coordinates,
      source,
      timing: "unavailable",
      durationS: actualDurationS ?? rideDurationS,
      startedAtMs: actualStartMs,
      endedAtMs: actualEndMs,
      canReplay: false
    };
  }

  if (timed.length >= 2 && pointSpanS != null) {
    const durationS = actualDurationS ?? pointSpanS;
    const elapsed = buildActualElapsed(points, actualStartMs ?? timedStartMs!, durationS);
    return {
      points: points.map((point, index) => createReplayPoint(point, elapsed[index])),
      coordinates,
      source,
      timing: "recorded",
      durationS,
      startedAtMs: actualStartMs,
      endedAtMs: actualEndMs ?? (actualStartMs != null ? actualStartMs + durationS * 1000 : null),
      canReplay: durationS > 0
    };
  }

  const estimatedDurationS = rideDurationS ?? actualDurationS;
  if (estimatedDurationS != null && estimatedDurationS > 0) {
    return {
      points: points.map((point, index) => createReplayPoint({
        ...point,
        timestampMs: null,
      }, (index / (points.length - 1)) * estimatedDurationS)),
      coordinates,
      source,
      timing: "estimated",
      durationS: estimatedDurationS,
      startedAtMs: rideStartMs,
      endedAtMs: rideEndMs,
      canReplay: true
    };
  }

  return {
    points: points.map((point) => createReplayPoint(point, 0)),
    coordinates,
    source,
    timing: "unavailable",
    durationS: null,
    startedAtMs: actualStartMs,
    endedAtMs: actualEndMs,
    canReplay: false
  };
}

export function getReplayPosition(model: RouteReplayModel, progress: number): ReplayPosition {
  if (!model.points.length) {
    return {
      coordinate: null,
      traveledCoordinates: [],
      untraveledCoordinates: [],
      elapsedS: 0,
      actualAtMs: null
    };
  }

  if (!model.canReplay || model.durationS == null) {
    const last = model.points[model.points.length - 1];
    return {
      coordinate: last,
      traveledCoordinates: [],
      untraveledCoordinates: [],
      elapsedS: 0,
      actualAtMs: null
    };
  }

  const safeProgress = clamp(progress, 0, 1);
  const elapsedS = safeProgress * model.durationS;
  const segmentIndex = findSegmentIndex(model.points, elapsedS);
  const start = model.points[segmentIndex];
  const end = model.points[Math.min(segmentIndex + 1, model.points.length - 1)];
  const segmentDuration = end.elapsedS - start.elapsedS;
  const segmentProgress = segmentDuration > 0 ? clamp((elapsedS - start.elapsedS) / segmentDuration, 0, 1) : 0;
  const coordinate = interpolateCoordinate(start, end, segmentProgress);
  const traveledCoordinates = model.points.slice(0, segmentIndex + 1).map(toCoordinate);
  if (!sameCoordinate(traveledCoordinates[traveledCoordinates.length - 1], coordinate)) {
    traveledCoordinates.push(coordinate);
  }
  const remainingCoordinates = model.points.slice(segmentIndex + 1).map(toCoordinate);
  const untraveledCoordinates = remainingCoordinates.length
    ? sameCoordinate(remainingCoordinates[0], coordinate)
      ? remainingCoordinates.length > 1 ? [coordinate, ...remainingCoordinates.slice(1)] : []
      : [coordinate, ...remainingCoordinates]
    : [];

  return {
    coordinate,
    traveledCoordinates,
    untraveledCoordinates,
    elapsedS,
    actualAtMs: model.timing === "recorded" && model.startedAtMs != null ? model.startedAtMs + elapsedS * 1000 : null
  };
}

export function replayProgressForElapsed(model: RouteReplayModel, elapsedS: number) {
  if (!model.canReplay || !model.durationS) {
    return 0;
  }
  return clamp(elapsedS / model.durationS, 0, 1);
}

export function replayDurationMs(speed: ReplaySpeed) {
  return NORMALIZED_REPLAY_DURATION_MS / speed;
}

export function replayTimingLabel(model: RouteReplayModel) {
  if (model.timing === "recorded") {
    return model.source === "imported" ? "Imported timestamps" : "Recorded GPS time";
  }
  if (model.timing === "estimated") {
    return model.source === "imported" ? "Estimated from imported route" : "Estimated route timing";
  }
  return "Time unavailable";
}

export function buildReplayFacts(input: ReplayRideInput, model: RouteReplayModel): ReplayFacts {
  const imported = model.source === "imported";
  const distanceM = nonNegativeNumber(input.distanceM);
  const durationS = model.durationS ?? positiveSeconds(input.durationS);
  const speedQuality = imported ? readImportedSpeedQuality(input.speedDataQuality) : "measured";
  const pointSpeeds = findRoutePoints(input)
    .map(readPointSpeed)
    .filter((speed): speed is number => speed != null && speed > 0);
  const suppliedAverage = positiveNumber(input.avgSpeedKmh);
  const suppliedPeak = positiveNumber(input.topSpeedKmh);
  const derivedAverage = distanceM != null && durationS != null && durationS > 0
    ? distanceM > 0 ? distanceM / 1000 / (durationS / 3600) : null
    : null;
  const averageSpeedKmh = imported
    ? speedQuality === "unavailable" ? null : suppliedAverage ?? derivedAverage
    : suppliedAverage ?? derivedAverage ?? (pointSpeeds.length ? pointSpeeds.reduce((sum, speed) => sum + speed, 0) / pointSpeeds.length : null);
  const peakSpeedKmh = imported
    ? speedQuality === "unavailable" ? null : suppliedPeak ?? estimateTimedLegPeakSpeedKmh(findRoutePoints(input))
    : suppliedPeak ?? (pointSpeeds.length ? Math.max(...pointSpeeds) : null);

  return {
    distanceM,
    durationS,
    activityLabel: activityLabel(input, imported),
    sourceLabel: replaySourceLabel(input, model.source),
    pointCount: model.coordinates.length,
    averageSpeedKmh,
    peakSpeedKmh,
    speedQuality
  };
}

/**
 * Estimate an imported route's peak from coordinate legs when the source did
 * not provide a summary speed. A percentile keeps one noisy GPS jump from
 * becoming the displayed peak, while requiring multiple valid legs avoids
 * presenting a single interval as a reliable statistic.
 */
export function estimateTimedLegPeakSpeedKmh(points: readonly ReplayPointInput[]) {
  const usableSpeeds: number[] = [];
  let previous: { coordinate: Coordinate; timestampMs: number } | null = null;

  for (const point of points) {
    const coordinate = normalizeReplayCoordinate(point);
    const timestampMs = readPointTimestamp(point);
    if (!coordinate || timestampMs == null) {
      previous = null;
      continue;
    }
    if (previous) {
      const elapsedS = (timestampMs - previous.timestampMs) / 1000;
      const speedKmh = elapsedS > 0
        ? (distanceMeters(previous.coordinate, coordinate) / 1000) / (elapsedS / 3600)
        : null;
      if (speedKmh != null && Number.isFinite(speedKmh) && speedKmh > 0 && speedKmh <= 250) {
        usableSpeeds.push(speedKmh);
      }
    }
    previous = { coordinate, timestampMs };
  }

  return usableSpeeds.length >= 2 ? upperPercentile(usableSpeeds, 0.85) : null;
}

export function replaySpeedFactLabel(facts: ReplayFacts, kind: "average" | "peak") {
  const label = kind === "average" ? "AVG SPEED" : "PEAK SPEED";
  const value = kind === "average" ? facts.averageSpeedKmh : facts.peakSpeedKmh;
  if (value == null) {
    return `${label} · Unavailable`;
  }
  if (facts.speedQuality === "measured") {
    return label;
  }
  return `${label} · ${facts.speedQuality === "estimated" ? "Estimated" : "Unavailable"}`;
}

export function formatReplaySeconds(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainder = safeSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function formatReplayActualTime(timestampMs: number | null) {
  if (timestampMs == null || !Number.isFinite(timestampMs)) {
    return "Unavailable";
  }
  const date = new Date(timestampMs);
  if (!Number.isFinite(date.getTime())) {
    return "Unavailable";
  }
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function hasReplayCoordinates(input?: ReplayRideInput | null) {
  return findRoutePoints(input || {}).some((point) => normalizeReplayCoordinate(point) != null);
}

function findRoutePoints(input: ReplayRideInput) {
  const candidates = [input.points, input.trackPoints, input.gpsPoints, input.track, input.route, input.coordinates, input.path, input.routePreview];
  const arrays = candidates.filter((candidate): candidate is readonly ReplayPointInput[] => Array.isArray(candidate));
  const countValid = (candidate: readonly ReplayPointInput[]) => candidate.reduce(
    (count, point) => count + (normalizeReplayCoordinate(point) ? 1 : 0),
    0
  );
  return arrays.find((candidate) => countValid(candidate) >= 2)
    || arrays.find((candidate) => countValid(candidate) > 0)
    || [];
}

function detectReplaySource(input: ReplayRideInput): ReplaySource {
  if (input.imported === true || input.isImported === true || typeof input.importId === "string" || Array.isArray(input.sourceSegmentIds)) {
    return "imported";
  }
  const sourceValue = [input.source, input.rideSource, input.importSource, input.origin]
    .map(sourceText)
    .find((value): value is string => Boolean(value));
  if (sourceValue) {
    if (/import|gpx|fit|kml|tcx|strava|google/.test(sourceValue)) {
      return "imported";
    }
    if (/record|manual|auto|gps|device/.test(sourceValue)) {
      return "recorded";
    }
  }
  if (Array.isArray(input.points) && input.points.some((point) => readPointTimestamp(point) != null)) {
    return "recorded";
  }
  return "unknown";
}

function buildActualElapsed(
  points: { timestampMs: number | null }[],
  startMs: number,
  durationS: number
) {
  const timedIndexes = points
    .map((point, index) => point.timestampMs != null ? index : -1)
    .filter((index) => index >= 0);
  const elapsed = points.map((point) => point.timestampMs == null ? 0 : clamp((point.timestampMs - startMs) / 1000, 0, durationS));
  for (let index = 0; index < points.length; index += 1) {
    if (points[index].timestampMs != null) {
      continue;
    }
    const before = [...timedIndexes].reverse().find((timedIndex) => timedIndex < index);
    const after = timedIndexes.find((timedIndex) => timedIndex > index);
    if (before == null && after != null) {
      elapsed[index] = elapsed[after] * (index / Math.max(1, after));
    } else if (before != null && after == null) {
      elapsed[index] = elapsed[before] + ((durationS - elapsed[before]) * (index - before) / Math.max(1, points.length - 1 - before));
    } else if (before != null && after != null) {
      const ratio = (index - before) / Math.max(1, after - before);
      elapsed[index] = elapsed[before] + (elapsed[after] - elapsed[before]) * ratio;
    }
  }
  return makeMonotonic(elapsed, durationS);
}

function makeMonotonic(values: number[], max: number) {
  let previous = 0;
  return values.map((value) => {
    const next = clamp(Math.max(previous, value), 0, max);
    previous = next;
    return next;
  });
}

function findSegmentIndex(points: ReplayPoint[], elapsedS: number) {
  for (let index = 0; index < points.length - 1; index += 1) {
    if (elapsedS <= points[index + 1].elapsedS) {
      return index;
    }
  }
  return Math.max(0, points.length - 2);
}

function interpolateCoordinate(start: Coordinate, end: Coordinate, progress: number): Coordinate {
  return {
    latitude: start.latitude + (end.latitude - start.latitude) * progress,
    longitude: start.longitude + (end.longitude - start.longitude) * progress
  };
}

function normalizeReplayCoordinate(value: ReplayPointInput): Coordinate | null {
  if (isPointArray(value)) {
    return normalizeBoundedCoordinate({ latitude: value[1], longitude: value[0] });
  }
  const point = value as Exclude<ReplayPointInput, readonly unknown[]>;
  return normalizeBoundedCoordinate({
    latitude: point.latitude ?? point.lat,
    longitude: point.longitude ?? point.lng ?? point.lon
  });
}

function readPointTimestamp(value: ReplayPointInput) {
  if (isPointArray(value)) {
    const candidate = value[2];
    return typeof candidate === "string" || (typeof candidate === "number" && candidate >= 1000000000)
      ? readTimestamp(candidate)
      : null;
  }
  const point = value as Exclude<ReplayPointInput, readonly unknown[]>;
  return readTimestamp(point.recordedAt ?? point.timestampMs ?? point.timestamp ?? point.time ?? point.at ?? point.date);
}

function readPointSpeed(value: ReplayPointInput) {
  if (isPointArray(value)) {
    return null;
  }
  const point = value as Exclude<ReplayPointInput, readonly unknown[]> & { speedKmh?: unknown; speed?: unknown };
  return positiveNumber(point.speedKmh ?? point.speed);
}

function readTimestamp(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return normalizeEpoch(value);
  }
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return normalizeEpoch(numeric);
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeEpoch(value: number) {
  return Math.abs(value) < 100000000000 ? value * 1000 : value;
}

function positiveSeconds(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function positiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function nonNegativeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function upperPercentile(values: readonly number[], percentile: number) {
  const sorted = [...values].sort((first, second) => first - second);
  if (!sorted.length) {
    return null;
  }
  const rank = clamp(percentile, 0, 1) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) {
    return sorted[lower];
  }
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (rank - lower);
}

function readImportedSpeedQuality(value: unknown): ReplaySpeedQuality {
  const quality = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (/measure|actual|observed/.test(quality)) {
    return "measured";
  }
  if (/derive|estimate|calculated|computed|inferred/.test(quality)) {
    return "estimated";
  }
  return "unavailable";
}

function activityLabel(input: ReplayRideInput, imported: boolean) {
  const value = [input.sourceActivityType, input.activityType, input.activity, input.rideKind]
    .map((candidate) => typeof candidate === "string" ? candidate.trim() : "")
    .find(Boolean);
  if (!value) {
    return imported ? "Imported route" : "Recorded ride";
  }
  return value
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function replaySourceLabel(input: ReplayRideInput, source: ReplaySource) {
  const raw = [input.source, input.rideSource, input.importSource, input.origin]
    .map(sourceText)
    .find((value): value is string => Boolean(value));
  if (raw && /google/.test(raw)) {
    return "Google Timeline";
  }
  if (source === "imported") {
    return "Imported route";
  }
  if (source === "recorded") {
    return "RidePulse recording";
  }
  return "Source unavailable";
}

function sourceText(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim().toLowerCase();
  }
  if (value && typeof value === "object") {
    const candidate = value as { type?: unknown; name?: unknown; source?: unknown };
    return sourceText(candidate.type ?? candidate.name ?? candidate.source);
  }
  return null;
}

function toCoordinate(point: ReplayPoint): Coordinate {
  return { latitude: point.latitude, longitude: point.longitude };
}

function createReplayPoint(point: ReplayPointWithCoordinate, elapsedS: number): ReplayPoint {
  return {
    ...point.coordinate,
    elapsedS,
    timestampMs: point.timestampMs
  };
}

function isPointArray(value: ReplayPointInput): value is readonly unknown[] {
  return Array.isArray(value);
}

function sameCoordinate(first?: Coordinate, second?: Coordinate) {
  return first?.latitude === second?.latitude && first?.longitude === second?.longitude;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
