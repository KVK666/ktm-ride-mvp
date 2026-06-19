import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL } from "../api/client";
import { RidePoint } from "../types";
import { diagnosticDetails, logDiagnostic } from "./diagnostics";
import { AUTO_PENDING_RIDES_KEY, MIRRORED_TOKEN_KEY } from "./trackingKeys";

const RIDE_UPLOAD_TIMEOUT_MS = 15000;

export type RideUploadPayload = {
  clientRideId?: string;
  startLabel: string;
  endLabel: string;
  startedAt: string;
  endedAt: string;
  points: RidePoint[];
};

export type PendingRideSyncResult = {
  attempted: number;
  uploaded: number;
  remaining: number;
  lastError?: string;
};

let pendingSync: Promise<PendingRideSyncResult> | null = null;

export async function uploadRidePayload(payload: RideUploadPayload, token: string) {
  const ride = ensureClientRideId(payload);
  if (ride.points.length < 2) {
    throw new Error("Ride requires at least two valid GPS points");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RIDE_UPLOAD_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/rides`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": ride.clientRideId || ""
      },
      body: JSON.stringify(ride)
    });
  } catch (err: any) {
    logDiagnostic({
      level: "error",
      area: "ride-upload",
      message: "Ride upload network failure",
      details: diagnosticDetails(err)
    });
    if (err?.name === "AbortError") {
      throw new Error("Ride upload timed out");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  const body = parseJson(text);
  if (!response.ok) {
    logDiagnostic({
      level: "error",
      area: "ride-upload",
      message: `Ride upload failed with ${response.status}`,
      details: text
    });
    throw new Error(body.error || "Unable to upload ride");
  }
  return body;
}

export async function queuePendingRide(payload: RideUploadPayload) {
  const ride = ensureClientRideId(payload);
  if (ride.points.length < 2) {
    await logDiagnostic({
      level: "warn",
      area: "ride-upload",
      message: "Invalid ride was not added to pending queue",
      details: `clientRideId=${ride.clientRideId || ""}`
    });
    return;
  }

  const pending = await readPendingRides();
  const next = [...pending.filter((item) => getRideClientId(item) !== ride.clientRideId), ride].slice(-20);
  try {
    await AsyncStorage.setItem(AUTO_PENDING_RIDES_KEY, JSON.stringify(next));
  } catch (err) {
    await logDiagnostic({
      level: "error",
      area: "ride-upload",
      message: "Pending ride queue save failed",
      details: diagnosticDetails(err)
    });
    throw new Error("Ride could not be saved locally");
  }
  await logDiagnostic({
    level: "warn",
    area: "ride-upload",
    message: "Ride saved to local pending upload queue",
    details: `clientRideId=${ride.clientRideId || ""} points=${ride.points.length}`
  });
}

export async function syncPendingAutoRides() {
  if (pendingSync) {
    return pendingSync;
  }
  pendingSync = syncPendingAutoRidesOnce().finally(() => {
    pendingSync = null;
  });
  return pendingSync;
}

async function syncPendingAutoRidesOnce() {
  const token = await AsyncStorage.getItem(MIRRORED_TOKEN_KEY);
  if (!token) {
    const remaining = await getPendingRideCount();
    return {
      attempted: 0,
      uploaded: 0,
      remaining,
      lastError: remaining ? "Login token unavailable. Log out and log in again, then retry upload." : undefined
    };
  }

  const pending = await readPendingRides();
  if (!pending.length) {
    return { attempted: 0, uploaded: 0, remaining: 0 };
  }

  const uniquePending = uniqueRides(pending);
  if (uniquePending.length !== pending.length) {
    await AsyncStorage.setItem(AUTO_PENDING_RIDES_KEY, JSON.stringify(uniquePending));
  }

  const remaining: RideUploadPayload[] = [];
  let uploaded = 0;
  let lastError = "";
  for (const ride of uniquePending) {
    try {
      await uploadRidePayload(ride, token);
      uploaded += 1;
    } catch (err) {
      lastError = readableError(err);
      logDiagnostic({
        level: "warn",
        area: "ride-upload",
        message: "Pending auto ride upload failed",
        details: diagnosticDetails(err)
      });
      remaining.push(ride);
    }
  }

  if (remaining.length) {
    await AsyncStorage.setItem(AUTO_PENDING_RIDES_KEY, JSON.stringify(remaining));
  } else {
    await AsyncStorage.removeItem(AUTO_PENDING_RIDES_KEY);
  }

  return {
    attempted: uniquePending.length,
    uploaded,
    remaining: remaining.length,
    lastError: remaining.length ? lastError || "Upload failed. Check internet and backend availability." : undefined
  };
}

export async function getPendingRideCount() {
  const pending = await readPendingRides();
  return uniqueRides(pending).length;
}

export function ensureClientRideId(payload: RideUploadPayload): RideUploadPayload {
  const normalized = normalizeRideUploadPayload(payload);
  return {
    ...normalized,
    clientRideId: getRideClientId(normalized)
  };
}

export function createRideClientId(prefix: "auto" | "manual", startedAt: string, endedAt: string, points: RidePoint[]) {
  const normalizedPoints = normalizeRidePoints(points);
  const safeStartedAt = safeText(startedAt) || "unknown-start";
  const safeEndedAt = safeText(endedAt) || "unknown-end";
  const first = normalizedPoints[0];
  const last = normalizedPoints[normalizedPoints.length - 1];
  return [
    prefix,
    safeStartedAt,
    safeEndedAt,
    normalizedPoints.length,
    first ? `${first.latitude.toFixed(6)},${first.longitude.toFixed(6)}` : "none",
    last ? `${last.latitude.toFixed(6)},${last.longitude.toFixed(6)}` : "none"
  ]
    .join(":")
    .replace(/[^a-zA-Z0-9:.,_-]/g, "_");
}

function getRideClientId(payload: RideUploadPayload) {
  return payload.clientRideId || createRideClientId("auto", payload.startedAt, payload.endedAt, payload.points);
}

function uniqueRides(rides: RideUploadPayload[]) {
  const seen = new Set<string>();
  const unique: RideUploadPayload[] = [];
  for (const ride of rides) {
    const normalized = ensureClientRideId(ride);
    if (seen.has(normalized.clientRideId || "")) {
      continue;
    }
    seen.add(normalized.clientRideId || "");
    unique.push(normalized);
  }
  return unique;
}

async function readPendingRides() {
  try {
    const stored = await AsyncStorage.getItem(AUTO_PENDING_RIDES_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map(normalizeRideUploadPayload)
      .filter((ride) => ride.points.length >= 2);
  } catch (err) {
    await logDiagnostic({
      level: "error",
      area: "ride-upload",
      message: "Pending ride queue could not be read",
      details: diagnosticDetails(err)
    });
    return [];
  }
}

function parseJson(text: string) {
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 180) };
  }
}

function readableError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || "Upload failed");
}

function normalizeRideUploadPayload(payload: any): RideUploadPayload {
  return {
    clientRideId: safeText(payload?.clientRideId) || undefined,
    startLabel: safeText(payload?.startLabel) || "Start point",
    endLabel: safeText(payload?.endLabel) || "End point",
    startedAt: safeDateText(payload?.startedAt),
    endedAt: safeDateText(payload?.endedAt),
    points: normalizeRidePoints(payload?.points)
  };
}

function normalizeRidePoints(points: any): RidePoint[] {
  if (!Array.isArray(points)) {
    return [];
  }

  return points
    .map((point): RidePoint | null => {
      const latitude = Number(point?.latitude);
      const longitude = Number(point?.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
      }
      return {
        latitude,
        longitude,
        altitudeM: optionalNumber(point?.altitudeM),
        accuracyM: optionalNumber(point?.accuracyM),
        speedKmh: optionalNumber(point?.speedKmh),
        recordedAt: safeDateText(point?.recordedAt)
      };
    })
    .filter((point): point is RidePoint => Boolean(point));
}

function optionalNumber(value: unknown) {
  if (value == null) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeDateText(value: unknown) {
  const text = safeText(value);
  return Number.isFinite(Date.parse(text)) ? text : new Date().toISOString();
}
