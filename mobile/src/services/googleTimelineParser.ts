import { GoogleTimelineCandidate, GoogleTimelineGroup, RidePoint } from "../types";

const DEFAULT_GROUP_GAP_MS = 90 * 60 * 1000;
const DEFAULT_MAX_POINTS_PER_CANDIDATE = 12000;
const EARTH_RADIUS_M = 6_371_000;

export type GoogleTimelineParseOptions = {
  groupGapMs?: number;
  maxPointsPerCandidate?: number;
};

export type GoogleTimelineParseResult = {
  candidates: GoogleTimelineCandidate[];
  groups: GoogleTimelineGroup[];
};

type RawSegment = {
  value: Record<string, any>;
  wrapper: Record<string, any>;
  index: number;
  sourceId: string;
  format: "semantic";
};

type TimelinePathPoint = {
  latitude: number;
  longitude: number;
  recordedAt: string;
};

type RawTimelineData = {
  segments: RawSegment[];
  pathPoints: TimelinePathPoint[];
};

/**
 * Parse the currently supported Google Timeline v1 export into upload-ready
 * candidates. The v1 export is intentionally strict: accepting a guessed
 * legacy shape would make a malformed file look like a valid empty import.
 */
export function parseGoogleTimeline(input: unknown, options: GoogleTimelineParseOptions = {}): GoogleTimelineParseResult {
  const timeline = collectTimelineData(input);
  timeline.pathPoints.sort((first, second) => Date.parse(first.recordedAt) - Date.parse(second.recordedAt));
  const candidates = reduceTimelineCandidates(
    timeline.segments
      .map((segment) => normalizeCandidate(
        segment,
        timeline.pathPoints,
        options.maxPointsPerCandidate || DEFAULT_MAX_POINTS_PER_CANDIDATE
      ))
      .filter((candidate): candidate is GoogleTimelineCandidate => candidate != null)
  );

  return {
    candidates,
    groups: groupTimelineCandidates(candidates, options.groupGapMs || DEFAULT_GROUP_GAP_MS)
  };
}

export function parseGoogleTimelineCandidates(input: unknown, options: GoogleTimelineParseOptions = {}) {
  return parseGoogleTimeline(input, options).candidates;
}

export function reduceTimelineCandidates(candidates: readonly GoogleTimelineCandidate[]) {
  const seen = new Set<string>();
  const result: GoogleTimelineCandidate[] = [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate.id !== "string" || seen.has(candidate.id)) continue;
    if (!isValidDate(candidate.startedAt) || !isValidDate(candidate.endedAt) || candidate.points.length < 2) continue;
    seen.add(candidate.id);
    result.push(candidate);
  }
  return result.sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
}

export type TimelineGroupOptions = {
  gapMs?: number;
  maxCandidatesPerGroup?: number;
};

/** Group vehicle segments from the same exported local calendar date. */
export function groupTimelineCandidates(
  candidates: readonly GoogleTimelineCandidate[],
  options: number | TimelineGroupOptions = DEFAULT_GROUP_GAP_MS
) {
  // The export's local calendar date is the user's intended trip boundary.
  // `gapMs` remains accepted for callers compiled against the earlier draft,
  // but no longer merges two different local dates.
  void options;
  const sorted = reduceTimelineCandidates(candidates);
  const byDate = new Map<string, GoogleTimelineCandidate[]>();
  for (const candidate of sorted) {
    const date = candidate.localDate || candidate.startedAt.slice(0, 10);
    const group = byDate.get(date) || [];
    group.push(candidate);
    byDate.set(date, group);
  }
  return Array.from(byDate.values()).map((group) => createGroup(group[0], group));
}

export function reduceTimelineGroups(groups: readonly GoogleTimelineGroup[]) {
  const seen = new Set<string>();
  return groups
    .filter((group) => {
      if (!group || typeof group.id !== "string" || seen.has(group.id)) return false;
      seen.add(group.id);
      return group.candidates.length > 0;
    })
    .map((group) => createGroup(group.candidates[0], reduceTimelineCandidates(group.candidates)))
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
}

export function parseGoogleTimelineCoordinate(value: unknown) {
  return normalizeCoordinate(value);
}

function collectTimelineData(input: unknown): RawTimelineData {
  const root = asRecord(input);
  const semanticSegments = arrayValue(root?.semanticSegments);
  if (!semanticSegments.length) throw new Error("Unsupported Google Timeline export. Expected a non-empty semanticSegments array.");
  const pathPoints = semanticSegments.flatMap((item) => extractSemanticPathPoints(asRecord(item) || {}));
  const segments = semanticSegments.flatMap((item, index) => {
    const wrapper = asRecord(item);
    const activity = asRecord(wrapper?.activity);
    if (!activity) return [];
    return [{ value: activity, wrapper: wrapper || {}, index, sourceId: text(wrapper?.id) || segmentFingerprint(activity, wrapper || {}), format: "semantic" as const }];
  });
  return { segments, pathPoints };
}

function normalizeCandidate(segment: RawSegment, timelinePathPoints: TimelinePathPoint[], maxPoints: number): GoogleTimelineCandidate | null {
  const value = segment.value;
  const activityType = activityTypeOf(value, segment.wrapper);
  if (!isVehicleActivity(activityType)) return null;

  const startedAt = timestampOf(
    value.startTime,
    segment.wrapper.startTime,
    value.duration?.startTimestampMs,
    value.duration?.startTimestamp,
    segment.wrapper.duration?.startTimestampMs
  );
  const endedAt = timestampOf(
    value.endTime,
    segment.wrapper.endTime,
    value.duration?.endTimestampMs,
    value.duration?.endTimestamp,
    segment.wrapper.duration?.endTimestampMs
  );
  if (!startedAt || !endedAt || Date.parse(endedAt) <= Date.parse(startedAt)) return null;

  const startValue = firstDefined(
    value.start,
    value.startLocation,
    value.startPoint,
    segment.wrapper.start,
    segment.wrapper.startLocation
  );
  const endValue = firstDefined(
    value.end,
    value.endLocation,
    value.endPoint,
    segment.wrapper.end,
    segment.wrapper.endLocation
  );
  const start = normalizeCoordinate(startValue);
  const end = normalizeCoordinate(endValue);
  if (!start || !end) return null;

  const associatedPathPoints = pathPointsBetween(timelinePathPoints, Date.parse(startedAt), Date.parse(endedAt));
  const waypoints = extractWaypoints(value, segment.wrapper);
  const pathPoints = associatedPathPoints.length
    ? associatedPathPoints
    : waypoints.map((coordinate, index) => ({
        ...coordinate,
        recordedAt: interpolateTimestamp(startedAt, endedAt, (index + 1) / (waypoints.length + 1))
      }));
  const points = samplePoints(
    dedupeTimedPoints([
      { ...start, recordedAt: startedAt },
      ...pathPoints,
      { ...end, recordedAt: endedAt }
    ]),
    Math.max(2, Math.min(maxPoints, 12000))
  );
  if (points.length < 2) return null;
  const exportedDistance = firstNumber(value.distanceMeters);
  if (segment.format === "semantic" && (exportedDistance == null || exportedDistance < 500)) return null;
  const distanceM = segment.format === "semantic"
    ? exportedDistance || 0
    : numeric(value.distanceMeters, value.distance, segment.wrapper.distanceMeters, segment.wrapper.distance);
  const calculatedDistanceM = routeDistance(points);
  const elapsedS = (Date.parse(endedAt) - Date.parse(startedAt)) / 1000;
  const durationS = Math.max(1, Math.round(elapsedS));
  const normalizedDistanceM = Number.isFinite(distanceM) && distanceM > 0 ? distanceM : calculatedDistanceM;
  if (normalizedDistanceM < 500 || elapsedS < 120) return null;

  return {
    // This is only a pre-normalization key. The persisted external ID is an
    // async SHA-256 of the canonical segment in googleTimelineImport.ts.
    id: `pending-${segment.sourceId}-${startedAt}-${endedAt}`,
    source: "google_timeline",
    activityType: activityType || "IN_VEHICLE",
    localDate: localDateOf(value.startTime, segment.wrapper.startTime, value.duration?.startTimestamp, segment.wrapper.duration?.startTimestamp, startedAt),
    startedAt,
    endedAt,
    startLabel: labelOf(startValue) || activityEndpointLabel(activityType, "start"),
    endLabel: labelOf(endValue) || activityEndpointLabel(activityType, "end"),
    distanceM: normalizedDistanceM,
    durationS,
    points,
    sourceSegmentIds: [segment.sourceId],
    selected: true
  };
}

function activityTypeOf(value: Record<string, any>, wrapper: Record<string, any>) {
  const topCandidate = asRecord(value.topCandidate);
  const activities = Array.isArray(value.activities) ? value.activities : [];
  const firstActivity = asRecord(activities[0]);
  return text(
    value.activityType,
    value.type,
    topCandidate?.type,
    firstActivity?.activityType,
    firstActivity?.type,
    wrapper.activityType
  ).toUpperCase();
}

function isVehicleActivity(type: string) {
  return type === "MOTORCYCLING" || type === "IN_PASSENGER_VEHICLE";
}

function activityEndpointLabel(activityType: string, endpoint: "start" | "end") {
  const activity = activityType === "MOTORCYCLING" ? "Motorcycle ride" : "Passenger ride";
  return `${activity} ${endpoint}`;
}

function extractWaypoints(value: Record<string, any>, wrapper: Record<string, any>) {
  const path = asRecord(value.waypointPath) || asRecord(wrapper.waypointPath) || asRecord(value.path);
  const waypoints = arrayValue(path?.waypoints);
  return waypoints.map(normalizeCoordinate).filter((coordinate): coordinate is { latitude: number; longitude: number } => coordinate != null);
}

function extractSemanticPathPoints(segment: Record<string, any>): TimelinePathPoint[] {
  const startTime = timestampOf(segment.startTime, segment.start?.time);
  const timelinePath = arrayValue(segment.timelinePath);
  if (!startTime || !timelinePath.length) return [];
  return timelinePath.flatMap((item) => {
    const value = asRecord(item) || {};
    const coordinate = normalizeCoordinate(firstDefined(value.point, value.latLng, value.location, value));
    if (!coordinate) return [];
    const recordedAt = timestampOf(
      value.timestamp,
      value.timestampMs,
      value.time,
      typeof value.durationMinutesOffset === "number" || typeof value.durationMinutesOffset === "string"
        ? Date.parse(startTime) + Number(value.durationMinutesOffset) * 60 * 1000
        : undefined
    );
    return recordedAt ? [{ ...coordinate, recordedAt }] : [];
  });
}

function pathPointsBetween(points: readonly TimelinePathPoint[], startMs: number, endMs: number) {
  const start = lowerBound(points, startMs);
  const end = upperBound(points, endMs);
  return points.slice(start, end);
}

function lowerBound(points: readonly TimelinePathPoint[], targetMs: number) {
  let low = 0;
  let high = points.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (Date.parse(points[middle].recordedAt) < targetMs) low = middle + 1;
    else high = middle;
  }
  return low;
}

function upperBound(points: readonly TimelinePathPoint[], targetMs: number) {
  let low = 0;
  let high = points.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (Date.parse(points[middle].recordedAt) <= targetMs) low = middle + 1;
    else high = middle;
  }
  return low;
}

function normalizeCoordinate(value: unknown): { latitude: number; longitude: number } | null {
  if (Array.isArray(value) && value.length >= 2) return boundedCoordinate(value[0], value[1]);
  if (typeof value === "string") {
    const matches = value.match(/(-?\d+(?:\.\d+)?)\s*(?:°\s*)?[,\s]\s*(-?\d+(?:\.\d+)?)\s*°?/);
    return matches ? boundedCoordinate(matches[1], matches[2]) : null;
  }

  const record = asRecord(value);
  if (!record) return null;
  if (record.latLng != null) return normalizeCoordinate(record.latLng);
  if (record.geo != null) return normalizeCoordinate(record.geo);
  if (record.placeLocation != null) return normalizeCoordinate(record.placeLocation);

  const latitude = firstNumber(record.latitude, record.lat, record.latitudeE7 != null ? Number(record.latitudeE7) / 1e7 : undefined, record.latE7 != null ? Number(record.latE7) / 1e7 : undefined);
  const longitude = firstNumber(record.longitude, record.lng, record.longitudeE7 != null ? Number(record.longitudeE7) / 1e7 : undefined, record.lngE7 != null ? Number(record.lngE7) / 1e7 : undefined);
  return boundedCoordinate(latitude, longitude);
}

function labelOf(value: unknown) {
  const record = asRecord(value);
  return text(record?.name, record?.address, record?.label, record?.placeName);
}

function timestampOf(...values: unknown[]) {
  for (const value of values) {
    const timestamp = normalizeTimestamp(value);
    if (timestamp) return timestamp;
  }
  return null;
}

function normalizeTimestamp(value: unknown) {
  if (typeof value === "number" || (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value.trim()))) {
    const number = Number(value);
    const milliseconds = number < 10_000_000_000 ? number * 1000 : number;
    const date = new Date(milliseconds);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function interpolateTimestamp(startedAt: string, endedAt: string, fraction: number) {
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  return new Date(start + (end - start) * Math.max(0, Math.min(1, fraction))).toISOString();
}

function localDateOf(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string") {
      const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
      if (match) return match[1];
    }
  }
  return "";
}

function samplePoints(points: RidePoint[], maxPoints: number) {
  if (points.length <= maxPoints) return points;
  const result: RidePoint[] = [];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let index = 0; index < maxPoints; index += 1) result.push(points[Math.round(index * step)]);
  return result;
}

function dedupeCoordinates(points: Array<{ latitude: number; longitude: number }>) {
  const result: Array<{ latitude: number; longitude: number }> = [];
  for (const point of points) {
    const previous = result[result.length - 1];
    if (!previous || Math.abs(previous.latitude - point.latitude) > 0.0000001 || Math.abs(previous.longitude - point.longitude) > 0.0000001) {
      result.push(point);
    }
  }
  return result;
}

function dedupeTimedPoints(points: RidePoint[]) {
  const result: RidePoint[] = [];
  for (const point of points.sort((first, second) => Date.parse(first.recordedAt) - Date.parse(second.recordedAt))) {
    const previous = result[result.length - 1];
    if (!previous || Math.abs(previous.latitude - point.latitude) > 0.0000001 || Math.abs(previous.longitude - point.longitude) > 0.0000001) {
      result.push(point);
    }
  }
  return result;
}

function routeDistance(points: readonly { latitude: number; longitude: number }[]) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += distanceBetween(points[index - 1], points[index]);
  return Math.round(total);
}

function distanceBetween(first: { latitude: number; longitude: number }, second: { latitude: number; longitude: number }) {
  const latitudeDelta = toRadians(second.latitude - first.latitude);
  const longitudeDelta = toRadians(second.longitude - first.longitude);
  const latitude1 = toRadians(first.latitude);
  const latitude2 = toRadians(second.latitude);
  const value = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)));
}

function createGroup(first: GoogleTimelineCandidate, candidates: GoogleTimelineCandidate[] = [first]): GoogleTimelineGroup {
  const sorted = reduceTimelineCandidates(candidates);
  const startedAt = sorted[0]?.startedAt || first.startedAt;
  const endedAt = sorted[sorted.length - 1]?.endedAt || first.endedAt;
  const localDate = sorted[0]?.localDate || startedAt.slice(0, 10);
  const id = `gtg-${hashText(sorted.map((candidate) => candidate.id).join("|"))}`;
  return {
    id,
    title: localizedDateTitle(localDate),
    startedAt,
    endedAt,
    distanceM: sorted.reduce((sum, candidate) => sum + candidate.distanceM, 0),
    candidates: sorted,
    selected: true,
    albumEnabled: sorted.length >= 2
  };
}

function localizedDateTitle(localDate: string) {
  const date = new Date(`${localDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return localDate;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function segmentFingerprint(value: Record<string, any>, wrapper: Record<string, any>) {
  const source = JSON.stringify({
    activityType: value.activityType || value.topCandidate?.type || value.type || "",
    startTime: value.startTime || wrapper.startTime || value.duration?.startTimestampMs || "",
    endTime: value.endTime || wrapper.endTime || value.duration?.endTimestampMs || "",
    start: value.start || value.startLocation || value.startPoint || "",
    end: value.end || value.endLocation || value.endPoint || ""
  });
  return `segment-${hashText(source)}`;
}

function boundedCoordinate(latitude: unknown, longitude: unknown) {
  const normalizedLatitude = Number(latitude);
  const normalizedLongitude = Number(longitude);
  if (!Number.isFinite(normalizedLatitude) || !Number.isFinite(normalizedLongitude) || Math.abs(normalizedLatitude) > 90 || Math.abs(normalizedLongitude) > 180) return null;
  return { latitude: normalizedLatitude, longitude: normalizedLongitude };
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (value == null || (typeof value === "string" && !value.trim())) continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function numeric(...values: unknown[]) {
  return firstNumber(...values) || 0;
}

function firstDefined(...values: unknown[]) {
  return values.find((value) => value != null);
}

function arrayValue(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : null;
}

function text(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function isValidDate(value: string) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function toRadians(value: number) {
  return value * Math.PI / 180;
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
