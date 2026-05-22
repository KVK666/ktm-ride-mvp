import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL } from "../api/client";
import { RidePoint } from "../types";
import { diagnosticDetails, logDiagnostic } from "./diagnostics";
import { AUTO_PENDING_RIDES_KEY, MIRRORED_TOKEN_KEY } from "./trackingKeys";

export type RideUploadPayload = {
  clientRideId?: string;
  startLabel: string;
  endLabel: string;
  startedAt: string;
  endedAt: string;
  points: RidePoint[];
};

let pendingSync: Promise<{ uploaded: number; remaining: number }> | null = null;

export async function uploadRidePayload(payload: RideUploadPayload, token: string) {
  const ride = ensureClientRideId(payload);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/rides`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": ride.clientRideId || ""
      },
      body: JSON.stringify(ride)
    });
  } catch (err) {
    logDiagnostic({
      level: "error",
      area: "ride-upload",
      message: "Ride upload network failure",
      details: diagnosticDetails(err)
    });
    throw err;
  }

  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
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
  const stored = await AsyncStorage.getItem(AUTO_PENDING_RIDES_KEY);
  const pending: RideUploadPayload[] = stored ? JSON.parse(stored) : [];
  const next = [...pending.filter((item) => getRideClientId(item) !== ride.clientRideId), ride].slice(-20);
  await AsyncStorage.setItem(AUTO_PENDING_RIDES_KEY, JSON.stringify(next));
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
    return { uploaded: 0, remaining: await getPendingRideCount() };
  }

  const stored = await AsyncStorage.getItem(AUTO_PENDING_RIDES_KEY);
  const pending: RideUploadPayload[] = stored ? JSON.parse(stored) : [];
  if (!pending.length) {
    return { uploaded: 0, remaining: 0 };
  }

  const uniquePending = uniqueRides(pending);
  if (uniquePending.length !== pending.length) {
    await AsyncStorage.setItem(AUTO_PENDING_RIDES_KEY, JSON.stringify(uniquePending));
  }

  const remaining: RideUploadPayload[] = [];
  let uploaded = 0;
  for (const ride of uniquePending) {
    try {
      await uploadRidePayload(ride, token);
      uploaded += 1;
    } catch (err) {
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

  return { uploaded, remaining: remaining.length };
}

export async function getPendingRideCount() {
  const stored = await AsyncStorage.getItem(AUTO_PENDING_RIDES_KEY);
  const pending: RideUploadPayload[] = stored ? JSON.parse(stored) : [];
  return uniqueRides(pending).length;
}

export function ensureClientRideId(payload: RideUploadPayload): RideUploadPayload {
  return {
    ...payload,
    clientRideId: getRideClientId(payload)
  };
}

export function createRideClientId(prefix: "auto" | "manual", startedAt: string, endedAt: string, points: RidePoint[]) {
  const first = points[0];
  const last = points[points.length - 1];
  return [
    prefix,
    startedAt,
    endedAt,
    points.length,
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
