import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { RidePoint } from "../types";
import { distanceMeters } from "../utils/distance";
import { locationToRidePoint } from "../utils/locationPoint";
import {
  addActivityRecognitionListener,
  getActivityRecognitionStatus,
  MotionActivity,
  startActivityRecognition,
  stopActivityRecognition
} from "./activityRecognition";
import { diagnosticDetails, logDiagnostic } from "./diagnostics";
import { appendManualRidePoints } from "./manualRideSession";
import {
  createRideClientId,
  queuePendingRide,
  RideUploadPayload,
  syncPendingAutoRides,
  uploadRidePayload
} from "./rideUpload";
import {
  AUTO_PENDING_RIDES_KEY,
  AUTO_RIDE_STATE_KEY,
  AUTO_TRACKING_ENABLED_KEY,
  BACKGROUND_LOCATION_TASK,
  BACKGROUND_POINTS_KEY,
  MANUAL_TRACKING_ACTIVE_KEY,
  MIRRORED_TOKEN_KEY
} from "./trackingKeys";

const AUTO_START_SPEED_KMH = 8;
const AUTO_START_DURATION_MS = 30 * 1000;
const AUTO_START_DISTANCE_M = 100;
const AUTO_START_GRACE_MS = 75 * 1000;
const AUTO_PROBE_TIMEOUT_MS = 3 * 60 * 1000;
const AUTO_ACTIVITY_INTERVAL_MS = 20 * 1000;
const AUTO_VEHICLE_CONFIDENCE = 60;
const AUTO_REPEATED_VEHICLE_CONFIDENCE = 45;
const AUTO_REPEATED_ACTIVITY_WINDOW_MS = 2 * 60 * 1000;
const AUTO_MAX_POINT_GAP_MS = 5 * 60 * 1000;
const AUTO_STOP_SPEED_KMH = 5;
const AUTO_STOP_DURATION_MS = 5 * 60 * 1000;
const MIN_AUTO_RIDE_DURATION_MS = 2 * 60 * 1000;
const MIN_AUTO_RIDE_DISTANCE_M = 500;
const MAX_AUTO_POINTS = 6000;
const AUTO_TRACKING_SERVICE_VERSION = "4";
const AUTO_TRACKING_SERVICE_VERSION_KEY = "duke_ride_auto_tracking_service_version";
const DUPLICATE_MOTION_EVENT_WINDOW_MS = 5 * 1000;

let motionActivityQueue: Promise<void> = Promise.resolve();
let lastMotionEventKey = "";
let lastMotionEventHandledAt = 0;

type AutoRideState =
  | {
      status: "armed";
      fallbackGps?: boolean;
      fallbackReason?: string;
      lastActivity?: MotionActivity;
      lastVehicleActivityAt?: string;
      candidateStartedAt?: string;
      candidateLastMovingAt?: string;
      candidatePoints?: RidePoint[];
      lastPoint?: RidePoint;
    }
  | {
      status: "probing";
      probeStartedAt: string;
      lastActivity?: MotionActivity;
      lastVehicleActivityAt?: string;
      candidateStartedAt?: string;
      candidateLastMovingAt?: string;
      candidatePoints?: RidePoint[];
      lastPoint?: RidePoint;
    }
  | {
      status: "riding";
      startedAt: string;
      lastMovingAt: string;
      points: RidePoint[];
    };

export type AutoTrackingStatus = {
  enabled: boolean;
  label: "Off" | "Armed" | "Checking movement" | "Auto ride in progress" | "Pending upload";
  pendingCount: number;
  autoRideActive: boolean;
  hint?: string;
  activeRide?: {
    startedAt: string;
    points: RidePoint[];
  };
};

export type AutoTrackingReadiness = {
  level: "ready" | "attention" | "off";
  title: string;
  detail: string;
};

export async function getAutoTrackingEnabled() {
  return (await AsyncStorage.getItem(AUTO_TRACKING_ENABLED_KEY)) === "true";
}

export async function getAutoTrackingStatus(): Promise<AutoTrackingStatus> {
  await ensureAutoTrackingServiceCurrent();
  const enabled = await getAutoTrackingEnabled();
  const pendingCount = await getPendingCount();
  const state = await readAutoRideState();

  if (!enabled) {
    return { enabled, label: pendingCount ? "Pending upload" : "Off", pendingCount, autoRideActive: false };
  }
  if (state.status === "riding") {
    return {
      enabled,
      label: "Auto ride in progress",
      pendingCount,
      autoRideActive: true,
      hint: "Recording automatically. The ride will finish after movement stops.",
      activeRide: { startedAt: state.startedAt, points: state.points }
    };
  }
  if (state.status === "probing") {
    return {
      enabled,
      label: "Checking movement",
      pendingCount,
      autoRideActive: false,
      hint: "RidePulse is briefly checking GPS because vehicle movement was detected."
    };
  }
  if (pendingCount) {
    return { enabled, label: "Pending upload", pendingCount, autoRideActive: false };
  }
  return {
    enabled,
    label: "Armed",
    pendingCount,
    autoRideActive: false,
    hint: state.fallbackGps
      ? `Motion detection unavailable; using low-power location fallback.${state.fallbackReason ? ` ${state.fallbackReason}` : ""}`
      : "Motion detection is armed. GPS will start after vehicle-like movement."
  };
}

export async function enableAutoTracking() {
  await ensureBackgroundPermissions();
  await AsyncStorage.setItem(AUTO_TRACKING_ENABLED_KEY, "true");
  await writeAutoRideState({ status: "armed" });
  await armMotionFirstAutoTracking();
  await AsyncStorage.setItem(AUTO_TRACKING_SERVICE_VERSION_KEY, AUTO_TRACKING_SERVICE_VERSION);
  await logDiagnostic({
    level: "info",
    area: "auto-tracking",
    message: "Automatic ride tracking armed"
  });
  return getAutoTrackingStatus();
}

export async function disableAutoTracking() {
  await AsyncStorage.setItem(AUTO_TRACKING_ENABLED_KEY, "false");
  await AsyncStorage.removeItem(AUTO_RIDE_STATE_KEY);
  await stopActivityRecognition().catch((err) => {
    void logDiagnostic({
      level: "warn",
      area: "auto-tracking",
      message: "Motion detection stop failed while disabling auto tracking",
      details: diagnosticDetails(err)
    });
  });
  const manualActive = (await AsyncStorage.getItem(MANUAL_TRACKING_ACTIVE_KEY)) === "true";
  if (!manualActive) {
    await stopBackgroundLocationUpdatesIfRunning();
  }
  return getAutoTrackingStatus();
}

export async function setManualTrackingActive(active: boolean) {
  await AsyncStorage.setItem(MANUAL_TRACKING_ACTIVE_KEY, active ? "true" : "false");
  if (active) {
    await writeAutoRideState({ status: "armed" });
  } else if (!(await getAutoTrackingEnabled())) {
    await stopBackgroundLocationUpdatesIfRunning();
  } else {
    await armMotionFirstAutoTracking();
  }
}

export async function startManualBackgroundTracking() {
  await startBackgroundLocationUpdates("Ride tracking is active.");
}

export async function stopManualBackgroundTracking() {
  await setManualTrackingActive(false);
}

export async function handleBackgroundLocations(locations: Location.LocationObject[]) {
  try {
    if (!Array.isArray(locations) || !locations.length) {
      return;
    }

    const points = locations
      .map(locationToRidePoint)
      .filter((point): point is RidePoint => Boolean(point));

    if (!points.length) {
      return;
    }

    const manualActive = (await AsyncStorage.getItem(MANUAL_TRACKING_ACTIVE_KEY)) === "true";
    if (manualActive) {
      await appendManualBackgroundPoints(points);
      return;
    }

    if (!(await getAutoTrackingEnabled())) {
      return;
    }

    let state = await readAutoRideState();
    for (const point of points) {
      state = await updateAutoRideState(state, point);
    }
    await writeAutoRideState(state);
  } catch (err) {
    await logDiagnostic({
      level: "error",
      area: "auto-tracking",
      message: "Auto tracking background update failed",
      details: diagnosticDetails(err)
    });
  }
}

export async function syncPendingRidesForCurrentUser() {
  return syncPendingAutoRides();
}

export function subscribeToMotionActivities(onHandled?: () => void) {
  return addActivityRecognitionListener((activity) => {
    void handleMotionActivity(activity)
      .then(onHandled)
      .catch((err) => {
        void logDiagnostic({
          level: "error",
          area: "auto-tracking",
          message: "Motion activity handling failed",
          details: diagnosticDetails(err)
        });
      });
  });
}

export async function handleMotionActivity(rawActivity: MotionActivity) {
  motionActivityQueue = motionActivityQueue
    .catch(() => undefined)
    .then(() => processMotionActivity(rawActivity));
  return motionActivityQueue;
}

async function processMotionActivity(rawActivity: MotionActivity) {
  const activity = normalizeMotionActivity(rawActivity);
  const eventKey = `${activity.type}:${activity.confidence}:${activity.detectedAt}`;
  const handledAt = Date.now();
  if (eventKey === lastMotionEventKey && handledAt - lastMotionEventHandledAt <= DUPLICATE_MOTION_EVENT_WINDOW_MS) {
    return;
  }
  lastMotionEventKey = eventKey;
  lastMotionEventHandledAt = handledAt;

  const enabled = await getAutoTrackingEnabled();
  const manualActive = (await AsyncStorage.getItem(MANUAL_TRACKING_ACTIVE_KEY)) === "true";
  if (!enabled || manualActive) {
    return;
  }

  let state = await readAutoRideState();
  if (state.status === "riding") {
    return;
  }

  if (isStoppedActivity(activity) && state.status === "probing" && !state.candidatePoints?.length) {
    await stopBackgroundLocationUpdatesIfRunning();
    await writeAutoRideState({
      status: "armed",
      lastActivity: activity,
      lastVehicleActivityAt: state.lastVehicleActivityAt
    });
    await logDiagnostic({
      level: "info",
      area: "auto-tracking",
      message: "GPS probe cancelled after still activity"
    });
    return;
  }

  if (isVehicleLikeActivity(activity, state)) {
    await startGpsProbeFromMotion(activity, state);
    return;
  }

  state = { ...state, lastActivity: activity };
  await writeAutoRideState(state);
}

export async function checkAutoTrackingReadiness(): Promise<AutoTrackingReadiness> {
  const enabled = await getAutoTrackingEnabled();
  if (!enabled) {
    return {
      level: "off",
      title: "Auto tracking is off",
      detail: "Enable it when you want RidePulse to wait for vehicle movement."
    };
  }

  const [foreground, background, locationServices, activityStatus, state] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
    Location.hasServicesEnabledAsync().catch(() => false),
    getActivityRecognitionStatus().catch(() => null),
    readAutoRideState()
  ]);

  if (foreground.status !== "granted" || background.status !== "granted") {
    return {
      level: "attention",
      title: "Location access needs attention",
      detail: "Allow precise location all the time so a detected ride can continue with the screen locked."
    };
  }
  if (!locationServices) {
    return {
      level: "attention",
      title: "Phone location is off",
      detail: "Turn on phone location before riding so RidePulse can confirm and record the route."
    };
  }
  if (state.status === "armed" && state.fallbackGps) {
    return {
      level: "attention",
      title: "Using location fallback",
      detail: state.fallbackReason || "Motion detection is unavailable, so battery use may be higher."
    };
  }
  if (!activityStatus?.available || !activityStatus.permissionGranted || !activityStatus.running) {
    return {
      level: "attention",
      title: "Motion detection needs attention",
      detail: "Turn auto tracking off and on once to re-arm battery-saving motion detection."
    };
  }
  return {
    level: "ready",
    title: state.status === "probing" ? "Checking detected movement" : "Ready for your next ride",
    detail: state.status === "probing"
      ? "GPS is temporarily active while RidePulse confirms motorcycle-like movement."
      : "Motion detection is armed. GPS stays off until vehicle-like movement is detected."
  };
}

async function ensureBackgroundPermissions() {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== "granted") {
    await logDiagnostic({
      level: "warn",
      area: "auto-tracking",
      message: "Foreground location permission denied for auto tracking"
    });
    throw new Error("Location permission is required for automatic ride tracking");
  }

  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== "granted") {
    await logDiagnostic({
      level: "warn",
      area: "auto-tracking",
      message: "Background location permission denied for auto tracking"
    });
    throw new Error("Background location permission is required for automatic ride tracking");
  }
}

async function ensureAutoTrackingServiceCurrent() {
  const enabled = await getAutoTrackingEnabled();
  const manualActive = (await AsyncStorage.getItem(MANUAL_TRACKING_ACTIVE_KEY)) === "true";
  if (!enabled || manualActive) {
    return;
  }

  const storedVersion = await AsyncStorage.getItem(AUTO_TRACKING_SERVICE_VERSION_KEY);
  if (storedVersion === AUTO_TRACKING_SERVICE_VERSION) {
    const state = await readAutoRideState();
    if (state.status !== "armed" || state.fallbackGps) {
      return;
    }
    try {
      const activityStatus = await getActivityRecognitionStatus();
      if (activityStatus.running) {
        return;
      }
    } catch {
      return;
    }
  }

  const foreground = await Location.getForegroundPermissionsAsync();
  const background = await Location.getBackgroundPermissionsAsync();
  if (foreground.status !== "granted" || background.status !== "granted") {
    return;
  }

  await armMotionFirstAutoTracking();
  await AsyncStorage.setItem(AUTO_TRACKING_SERVICE_VERSION_KEY, AUTO_TRACKING_SERVICE_VERSION);
  await logDiagnostic({
    level: "info",
    area: "auto-tracking",
    message: "Automatic ride tracking service refreshed for motion-first detection"
  });
}

async function armMotionFirstAutoTracking() {
  try {
    await startActivityRecognition(AUTO_ACTIVITY_INTERVAL_MS);
    const state = await readAutoRideState();
    if (state.status !== "riding" && state.status !== "probing") {
      await writeAutoRideState({
        status: "armed",
        lastActivity: state.lastActivity,
        lastVehicleActivityAt: state.lastVehicleActivityAt
      });
      await stopBackgroundLocationUpdatesIfRunning();
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Motion detection unavailable.";
    await writeAutoRideState({
      status: "armed",
      fallbackGps: true,
      fallbackReason: reason
    });
    await startBackgroundLocationUpdates("Motion detection is unavailable. RidePulse is using low-power location fallback.", true, "fallback");
    await logDiagnostic({
      level: "warn",
      area: "auto-tracking",
      message: "Motion-first auto tracking fell back to low-power location",
      details: diagnosticDetails(err)
    });
  }
}

async function startGpsProbeFromMotion(activity: MotionActivity, state: AutoRideState) {
  const now = new Date().toISOString();
  const nextState: AutoRideState = state.status === "probing"
    ? {
        ...state,
        lastActivity: activity,
        lastVehicleActivityAt: now
      }
    : {
        status: "probing",
        probeStartedAt: now,
        lastActivity: activity,
        lastVehicleActivityAt: now,
        candidatePoints: state.status === "armed" ? state.candidatePoints : undefined,
        lastPoint: state.status === "armed" ? state.lastPoint : undefined
      };
  await writeAutoRideState(nextState);
  await startBackgroundLocationUpdates(
    "RidePulse detected movement and is checking for a ride.",
    state.status !== "probing",
    "probe"
  );
  await logDiagnostic({
    level: "info",
    area: "auto-tracking",
    message: "GPS probe started from motion detection",
    details: `${activity.type} confidence=${activity.confidence}`
  });
}

async function startBackgroundLocationUpdates(
  notificationBody: string,
  restart = false,
  mode: "tracking" | "probe" | "fallback" = "tracking"
) {
  const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  if (running && !restart) {
    return;
  }
  if (running) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: mode === "fallback" ? Location.Accuracy.Balanced : Location.Accuracy.Highest,
    distanceInterval: mode === "fallback" ? 150 : 15,
    timeInterval: mode === "fallback" ? 60000 : 5000,
    deferredUpdatesDistance: mode === "fallback" ? 150 : undefined,
    deferredUpdatesInterval: mode === "fallback" ? 60000 : undefined,
    mayShowUserSettingsDialog: true,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "RidePulse tracking",
      notificationBody
    }
  });
}

async function stopBackgroundLocationUpdatesIfRunning() {
  const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  if (running) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
}

async function appendManualBackgroundPoints(points: RidePoint[]) {
  try {
    await appendManualRidePoints(points);
  } catch (err) {
    await logDiagnostic({
      level: "error",
      area: "manual-ride",
      message: "Manual session point persistence failed",
      details: diagnosticDetails(err)
    });
  }
  try {
    const stored = await AsyncStorage.getItem(BACKGROUND_POINTS_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    const existing: RidePoint[] = Array.isArray(parsed) ? parsed.filter(isRidePoint) : [];
    await AsyncStorage.setItem(BACKGROUND_POINTS_KEY, JSON.stringify([...existing, ...points].slice(-6000)));
  } catch (err) {
    await logDiagnostic({
      level: "error",
      area: "manual-ride",
      message: "Manual background point persistence failed",
      details: diagnosticDetails(err)
    });
  }
}

async function updateAutoRideState(state: AutoRideState, point: RidePoint): Promise<AutoRideState> {
  if (state.status === "riding") {
    return updateActiveRide(state, point);
  }

  if (state.status === "armed" && !state.fallbackGps) {
    return { ...state, lastPoint: point };
  }

  const previousPoint = recentPoint(state.candidatePoints?.[state.candidatePoints.length - 1] || state.lastPoint, point);
  const movement = movementBetween(previousPoint, point);
  const moving =
    movement.reportedSpeedKmh >= AUTO_START_SPEED_KMH ||
    movement.inferredSpeedKmh >= AUTO_START_SPEED_KMH ||
    movement.distanceM >= 15;

  if (!moving && !state.candidatePoints?.length) {
    return { ...state, lastPoint: point };
  }

  const candidateSeed = state.candidatePoints?.length
    ? state.candidatePoints
    : previousPoint
      ? [previousPoint]
      : [];
  const candidatePoints = [...candidateSeed, point].slice(-200);
  const firstPoint = candidatePoints[0];
  const candidateStartedAt = state.candidateStartedAt || firstPoint.recordedAt;
  const candidateLastMovingAt = moving
    ? point.recordedAt
    : state.candidateLastMovingAt || candidateStartedAt;
  const durationMs = timestampMs(point.recordedAt) - timestampMs(firstPoint.recordedAt);
  const distanceM = routeDistance(candidatePoints);
  const quietMs = timestampMs(point.recordedAt) - timestampMs(candidateLastMovingAt);

  if (durationMs >= AUTO_START_DURATION_MS && distanceM >= AUTO_START_DISTANCE_M) {
    await stopActivityRecognition().catch((err) => {
      void logDiagnostic({
        level: "warn",
        area: "auto-tracking",
        message: "Motion detection stop failed after automatic ride start",
        details: diagnosticDetails(err)
      });
    });
    await logDiagnostic({
      level: "info",
      area: "auto-tracking",
      message: "Automatic ride started",
      details: `duration=${Math.round(durationMs / 1000)}s distance=${Math.round(distanceM)}m reportedSpeed=${movement.reportedSpeedKmh.toFixed(1)} inferredSpeed=${movement.inferredSpeedKmh.toFixed(1)}`
    });
    return {
      status: "riding",
      startedAt: firstPoint.recordedAt,
      lastMovingAt: point.recordedAt,
      points: candidatePoints
    };
  }

  if (quietMs > AUTO_START_GRACE_MS) {
    if (state.status === "probing" || !state.fallbackGps) {
      await stopBackgroundLocationUpdatesIfRunning();
      return {
        status: "armed",
        lastActivity: state.lastActivity,
        lastVehicleActivityAt: state.lastVehicleActivityAt,
        lastPoint: point
      };
    }
    return {
      status: "armed",
      fallbackGps: true,
      fallbackReason: state.fallbackReason,
      lastActivity: state.lastActivity,
      lastVehicleActivityAt: state.lastVehicleActivityAt,
      lastPoint: point
    };
  }

  if (state.status === "probing") {
    const probeMs = timestampMs(point.recordedAt) - timestampMs(state.probeStartedAt);
    if (probeMs >= AUTO_PROBE_TIMEOUT_MS) {
      await stopBackgroundLocationUpdatesIfRunning();
      await logDiagnostic({
        level: "info",
        area: "auto-tracking",
        message: "GPS probe stopped without starting an automatic ride",
        details: `duration=${Math.round(probeMs / 1000)}s distance=${Math.round(distanceM)}m`
      });
      return {
        status: "armed",
        lastActivity: state.lastActivity,
        lastVehicleActivityAt: state.lastVehicleActivityAt,
        lastPoint: point
      };
    }
  }

  return {
    ...state,
    candidateStartedAt,
    candidateLastMovingAt,
    candidatePoints,
    lastPoint: point
  };
}

async function updateActiveRide(
  state: Extract<AutoRideState, { status: "riding" }>,
  point: RidePoint
): Promise<AutoRideState> {
  const points = [...state.points, point].slice(-MAX_AUTO_POINTS);
  const previousPoint = state.points[state.points.length - 1];
  const movement = movementBetween(previousPoint, point);
  const moving =
    movement.reportedSpeedKmh > AUTO_STOP_SPEED_KMH ||
    movement.inferredSpeedKmh > AUTO_STOP_SPEED_KMH ||
    movement.distanceM >= 10;
  const lastMovingAt = moving ? point.recordedAt : state.lastMovingAt;
  const stoppedMs = timestampMs(point.recordedAt) - timestampMs(lastMovingAt);

  if (stoppedMs >= AUTO_STOP_DURATION_MS) {
    await finalizeAutoRide(points, state.startedAt, point.recordedAt);
    await armMotionFirstAutoTracking();
    return { status: "armed" };
  }

  return { ...state, points, lastMovingAt };
}

async function finalizeAutoRide(points: RidePoint[], startedAt: string, endedAt: string) {
  if (points.length < 2) {
    return;
  }

  const distanceM = routeDistance(points);
  const durationMs = timestampMs(endedAt) - timestampMs(startedAt);
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    await logDiagnostic({
      level: "warn",
      area: "auto-tracking",
      message: "Automatic ride discarded because timestamps were invalid"
    });
    return;
  }

  if (durationMs < MIN_AUTO_RIDE_DURATION_MS || distanceM < MIN_AUTO_RIDE_DISTANCE_M) {
    await logDiagnostic({
      level: "info",
      area: "auto-tracking",
      message: "Automatic ride discarded as too short",
      details: `duration=${Math.round(durationMs / 1000)}s distance=${Math.round(distanceM)}m`
    });
    return;
  }

  const payload = createRidePayload(points, startedAt, endedAt);
  const token = await AsyncStorage.getItem(MIRRORED_TOKEN_KEY);
  if (!token) {
    await queuePendingRide(payload);
    await logDiagnostic({
      level: "warn",
      area: "auto-tracking",
      message: "Automatic ride queued because no auth token was available"
    });
    return;
  }

  try {
    await uploadRidePayload(payload, token);
    await logDiagnostic({
      level: "info",
      area: "auto-tracking",
      message: "Automatic ride uploaded",
      details: `duration=${Math.round(durationMs / 1000)}s distance=${Math.round(distanceM)}m`
    });
  } catch (err) {
    await queuePendingRide(payload);
    await logDiagnostic({
      level: "warn",
      area: "auto-tracking",
      message: "Automatic ride queued after upload failure",
      details: diagnosticDetails(err)
    });
  }
}

function createRidePayload(points: RidePoint[], startedAt: string, endedAt: string): RideUploadPayload {
  const start = points[0];
  const end = points[points.length - 1];
  return {
    clientRideId: createRideClientId("auto", startedAt, endedAt, points),
    startLabel: `Auto start (${coordinateLabel(start)})`,
    endLabel: `Auto end (${coordinateLabel(end)})`,
    startedAt,
    endedAt,
    points
  };
}

function routeDistance(points: RidePoint[]) {
  let distanceM = 0;
  for (let index = 1; index < points.length; index += 1) {
    const segment = distanceMeters(points[index - 1], points[index]);
    if (Number.isFinite(segment)) {
      distanceM += segment;
    }
  }
  return distanceM;
}

function movementBetween(previous: RidePoint | undefined, current: RidePoint) {
  const reportedSpeedKmh = Math.max(0, current.speedKmh || 0);
  if (!previous) {
    return { distanceM: 0, inferredSpeedKmh: 0, reportedSpeedKmh };
  }

  const distanceM = distanceMeters(previous, current);
  const elapsedS = (timestampMs(current.recordedAt) - timestampMs(previous.recordedAt)) / 1000;
  const inferredSpeedKmh = elapsedS > 0 ? (distanceM / 1000 / (elapsedS / 3600)) : 0;
  return { distanceM, inferredSpeedKmh, reportedSpeedKmh };
}

function normalizeMotionActivity(activity: MotionActivity): MotionActivity {
  return {
    type: typeof activity?.type === "string" ? activity.type : "UNKNOWN",
    confidence: Number.isFinite(Number(activity?.confidence)) ? Number(activity.confidence) : 0,
    detectedAt: typeof activity?.detectedAt === "string" ? activity.detectedAt : new Date().toISOString()
  };
}

function isVehicleLikeActivity(activity: MotionActivity, state: AutoRideState) {
  if (state.status === "riding") {
    return false;
  }

  if (activity.type === "IN_VEHICLE" && activity.confidence >= AUTO_VEHICLE_CONFIDENCE) {
    return true;
  }

  if (activity.type === "ON_BICYCLE" && activity.confidence >= 80) {
    return true;
  }

  if (activity.type !== "IN_VEHICLE" || activity.confidence < AUTO_REPEATED_VEHICLE_CONFIDENCE) {
    return false;
  }

  const previous = state.lastActivity;
  if (previous?.type !== "IN_VEHICLE" || previous.confidence < AUTO_REPEATED_VEHICLE_CONFIDENCE) {
    return false;
  }

  const gapMs = timestampMs(activity.detectedAt) - timestampMs(previous.detectedAt);
  return gapMs >= 0 && gapMs <= AUTO_REPEATED_ACTIVITY_WINDOW_MS;
}

function isStoppedActivity(activity: MotionActivity) {
  return activity.type === "STILL" && activity.confidence >= 75;
}

function recentPoint(previous: RidePoint | undefined, current: RidePoint) {
  if (!previous) {
    return undefined;
  }

  const gapMs = timestampMs(current.recordedAt) - timestampMs(previous.recordedAt);
  if (gapMs < 0 || gapMs > AUTO_MAX_POINT_GAP_MS) {
    return undefined;
  }

  return previous;
}

function coordinateLabel(point: RidePoint) {
  const latitude = Number.isFinite(point.latitude) ? point.latitude : 0;
  const longitude = Number.isFinite(point.longitude) ? point.longitude : 0;
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

async function readAutoRideState(): Promise<AutoRideState> {
  try {
    const stored = await AsyncStorage.getItem(AUTO_RIDE_STATE_KEY);
    const parsed = stored ? JSON.parse(stored) : { status: "armed" };
    if (parsed?.status === "watching") {
      return {
        status: "armed",
        candidateStartedAt: parsed.candidateStartedAt,
        candidateLastMovingAt: parsed.candidateLastMovingAt,
        candidatePoints: Array.isArray(parsed.candidatePoints) ? parsed.candidatePoints.filter(isRidePoint) : undefined,
        lastPoint: parsed.lastPoint && isRidePoint(parsed.lastPoint) ? parsed.lastPoint : undefined
      };
    }
    if (isAutoRideState(parsed)) {
      return parsed;
    }
    throw new Error("Stored auto ride state was invalid");
  } catch (err) {
    await logDiagnostic({
      level: "error",
      area: "auto-tracking",
      message: "Auto ride state could not be read; resetting state",
      details: diagnosticDetails(err)
    });
    try {
      await AsyncStorage.removeItem(AUTO_RIDE_STATE_KEY);
    } catch {
      // Ignore cleanup failures; returning a fresh state keeps tracking alive.
    }
    return { status: "armed" };
  }
}

async function writeAutoRideState(state: AutoRideState) {
  try {
    await AsyncStorage.setItem(AUTO_RIDE_STATE_KEY, JSON.stringify(state));
  } catch (err) {
    await logDiagnostic({
      level: "error",
      area: "auto-tracking",
      message: "Auto ride state could not be saved",
      details: diagnosticDetails(err)
    });
  }
}

async function getPendingCount() {
  try {
    const stored = await AsyncStorage.getItem(AUTO_PENDING_RIDES_KEY);
    const pending = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(pending)) {
      return 0;
    }
    return pending.length;
  } catch (err) {
    await logDiagnostic({
      level: "error",
      area: "ride-upload",
      message: "Pending ride queue count failed",
      details: diagnosticDetails(err)
    });
    return 0;
  }
}

function timestampMs(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isRidePoint(point: any): point is RidePoint {
  return (
    point &&
    Number.isFinite(Number(point.latitude)) &&
    Number.isFinite(Number(point.longitude)) &&
    typeof point.recordedAt === "string"
  );
}

function isAutoRideState(value: any): value is AutoRideState {
  if (!value || (value.status !== "armed" && value.status !== "probing" && value.status !== "riding")) {
    return false;
  }

  if (value.status === "riding") {
    return (
      typeof value.startedAt === "string" &&
      typeof value.lastMovingAt === "string" &&
      Array.isArray(value.points) &&
      value.points.every(isRidePoint)
    );
  }

  if (value.status === "probing" && typeof value.probeStartedAt !== "string") {
    return false;
  }

  return (
    (value.candidatePoints == null || (Array.isArray(value.candidatePoints) && value.candidatePoints.every(isRidePoint))) &&
    (value.lastPoint == null || isRidePoint(value.lastPoint))
  );
}
