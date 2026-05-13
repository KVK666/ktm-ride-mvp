import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { RidePoint } from "../types";
import { distanceMeters } from "../utils/distance";
import { queuePendingRide, RideUploadPayload, syncPendingAutoRides, uploadRidePayload } from "./rideUpload";
import {
  AUTO_PENDING_RIDES_KEY,
  AUTO_RIDE_STATE_KEY,
  AUTO_TRACKING_ENABLED_KEY,
  BACKGROUND_LOCATION_TASK,
  BACKGROUND_POINTS_KEY,
  MANUAL_TRACKING_ACTIVE_KEY,
  MIRRORED_TOKEN_KEY
} from "./trackingKeys";

const AUTO_START_SPEED_KMH = 15;
const AUTO_START_DURATION_MS = 60 * 1000;
const AUTO_START_DISTANCE_M = 250;
const AUTO_STOP_SPEED_KMH = 5;
const AUTO_STOP_DURATION_MS = 5 * 60 * 1000;
const MIN_AUTO_RIDE_DURATION_MS = 2 * 60 * 1000;
const MIN_AUTO_RIDE_DISTANCE_M = 500;
const MAX_AUTO_POINTS = 6000;

type AutoRideState =
  | {
      status: "watching";
      candidateStartedAt?: string;
      candidatePoints?: RidePoint[];
    }
  | {
      status: "riding";
      startedAt: string;
      lastMovingAt: string;
      points: RidePoint[];
    };

export type AutoTrackingStatus = {
  enabled: boolean;
  label: "Off" | "Watching" | "Auto ride in progress" | "Pending upload";
  pendingCount: number;
  autoRideActive: boolean;
};

export async function getAutoTrackingEnabled() {
  return (await AsyncStorage.getItem(AUTO_TRACKING_ENABLED_KEY)) === "true";
}

export async function getAutoTrackingStatus(): Promise<AutoTrackingStatus> {
  const enabled = await getAutoTrackingEnabled();
  const pendingCount = await getPendingCount();
  const state = await readAutoRideState();

  if (!enabled) {
    return { enabled, label: pendingCount ? "Pending upload" : "Off", pendingCount, autoRideActive: false };
  }
  if (state.status === "riding") {
    return { enabled, label: "Auto ride in progress", pendingCount, autoRideActive: true };
  }
  if (pendingCount) {
    return { enabled, label: "Pending upload", pendingCount, autoRideActive: false };
  }
  return { enabled, label: "Watching", pendingCount, autoRideActive: false };
}

export async function enableAutoTracking() {
  await ensureBackgroundPermissions();
  await AsyncStorage.setItem(AUTO_TRACKING_ENABLED_KEY, "true");
  await writeAutoRideState({ status: "watching" });
  await startBackgroundLocationUpdates("Duke Ride auto tracking is watching for rides.");
  return getAutoTrackingStatus();
}

export async function disableAutoTracking() {
  await AsyncStorage.setItem(AUTO_TRACKING_ENABLED_KEY, "false");
  await AsyncStorage.removeItem(AUTO_RIDE_STATE_KEY);
  const manualActive = (await AsyncStorage.getItem(MANUAL_TRACKING_ACTIVE_KEY)) === "true";
  if (!manualActive) {
    await stopBackgroundLocationUpdatesIfRunning();
  }
  return getAutoTrackingStatus();
}

export async function setManualTrackingActive(active: boolean) {
  await AsyncStorage.setItem(MANUAL_TRACKING_ACTIVE_KEY, active ? "true" : "false");
  if (active) {
    await writeAutoRideState({ status: "watching" });
  } else if (!(await getAutoTrackingEnabled())) {
    await stopBackgroundLocationUpdatesIfRunning();
  }
}

export async function startManualBackgroundTracking() {
  await startBackgroundLocationUpdates("Ride tracking is active.");
}

export async function stopManualBackgroundTracking() {
  await setManualTrackingActive(false);
}

export async function handleBackgroundLocations(locations: Location.LocationObject[]) {
  if (!locations.length) {
    return;
  }

  const manualActive = (await AsyncStorage.getItem(MANUAL_TRACKING_ACTIVE_KEY)) === "true";
  const points = locations.map(toRidePoint);

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
}

export async function syncPendingRidesForCurrentUser() {
  return syncPendingAutoRides();
}

async function ensureBackgroundPermissions() {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== "granted") {
    throw new Error("Location permission is required for automatic ride tracking");
  }

  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== "granted") {
    throw new Error("Background location permission is required for automatic ride tracking");
  }
}

async function startBackgroundLocationUpdates(notificationBody: string) {
  const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  if (running) {
    return;
  }

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    distanceInterval: 25,
    timeInterval: 10000,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "Duke Ride tracking",
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
  const stored = await AsyncStorage.getItem(BACKGROUND_POINTS_KEY);
  const existing: RidePoint[] = stored ? JSON.parse(stored) : [];
  await AsyncStorage.setItem(BACKGROUND_POINTS_KEY, JSON.stringify([...existing, ...points].slice(-4000)));
}

async function updateAutoRideState(state: AutoRideState, point: RidePoint): Promise<AutoRideState> {
  if (state.status === "riding") {
    return updateActiveRide(state, point);
  }

  const speed = point.speedKmh || 0;
  if (speed < AUTO_START_SPEED_KMH) {
    return { status: "watching" };
  }

  const candidatePoints = [...(state.candidatePoints || []), point].slice(-200);
  const firstPoint = candidatePoints[0];
  const durationMs = new Date(point.recordedAt).getTime() - new Date(firstPoint.recordedAt).getTime();
  const distanceM = routeDistance(candidatePoints);

  if (durationMs >= AUTO_START_DURATION_MS && distanceM >= AUTO_START_DISTANCE_M) {
    return {
      status: "riding",
      startedAt: firstPoint.recordedAt,
      lastMovingAt: point.recordedAt,
      points: candidatePoints
    };
  }

  return { status: "watching", candidateStartedAt: firstPoint.recordedAt, candidatePoints };
}

async function updateActiveRide(
  state: Extract<AutoRideState, { status: "riding" }>,
  point: RidePoint
): Promise<AutoRideState> {
  const points = [...state.points, point].slice(-MAX_AUTO_POINTS);
  const speed = point.speedKmh || 0;
  const lastMovingAt = speed > AUTO_STOP_SPEED_KMH ? point.recordedAt : state.lastMovingAt;
  const stoppedMs = new Date(point.recordedAt).getTime() - new Date(lastMovingAt).getTime();

  if (stoppedMs >= AUTO_STOP_DURATION_MS) {
    await finalizeAutoRide(points, state.startedAt, point.recordedAt);
    return { status: "watching" };
  }

  return { ...state, points, lastMovingAt };
}

async function finalizeAutoRide(points: RidePoint[], startedAt: string, endedAt: string) {
  const distanceM = routeDistance(points);
  const durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (durationMs < MIN_AUTO_RIDE_DURATION_MS || distanceM < MIN_AUTO_RIDE_DISTANCE_M) {
    return;
  }

  const payload = createRidePayload(points, startedAt, endedAt);
  const token = await AsyncStorage.getItem(MIRRORED_TOKEN_KEY);
  if (!token) {
    await queuePendingRide(payload);
    return;
  }

  try {
    await uploadRidePayload(payload, token);
  } catch {
    await queuePendingRide(payload);
  }
}

function createRidePayload(points: RidePoint[], startedAt: string, endedAt: string): RideUploadPayload {
  const start = points[0];
  const end = points[points.length - 1];
  return {
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
    distanceM += distanceMeters(points[index - 1], points[index]);
  }
  return distanceM;
}

function coordinateLabel(point: RidePoint) {
  return `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`;
}

function toRidePoint(location: Location.LocationObject): RidePoint {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    altitudeM: location.coords.altitude,
    speedKmh: Math.max(0, (location.coords.speed || 0) * 3.6),
    recordedAt: new Date(location.timestamp).toISOString()
  };
}

async function readAutoRideState(): Promise<AutoRideState> {
  const stored = await AsyncStorage.getItem(AUTO_RIDE_STATE_KEY);
  return stored ? JSON.parse(stored) : { status: "watching" };
}

async function writeAutoRideState(state: AutoRideState) {
  await AsyncStorage.setItem(AUTO_RIDE_STATE_KEY, JSON.stringify(state));
}

async function getPendingCount() {
  const stored = await AsyncStorage.getItem(AUTO_PENDING_RIDES_KEY);
  const pending = stored ? JSON.parse(stored) : [];
  return pending.length;
}
