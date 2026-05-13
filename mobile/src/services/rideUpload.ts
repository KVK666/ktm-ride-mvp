import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL } from "../api/client";
import { RidePoint } from "../types";
import { AUTO_PENDING_RIDES_KEY, MIRRORED_TOKEN_KEY } from "./trackingKeys";

export type RideUploadPayload = {
  startLabel: string;
  endLabel: string;
  startedAt: string;
  endedAt: string;
  points: RidePoint[];
};

export async function uploadRidePayload(payload: RideUploadPayload, token: string) {
  const response = await fetch(`${API_BASE_URL}/rides`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(body.error || "Unable to upload ride");
  }
  return body;
}

export async function queuePendingRide(payload: RideUploadPayload) {
  const stored = await AsyncStorage.getItem(AUTO_PENDING_RIDES_KEY);
  const pending: RideUploadPayload[] = stored ? JSON.parse(stored) : [];
  await AsyncStorage.setItem(AUTO_PENDING_RIDES_KEY, JSON.stringify([...pending, payload].slice(-20)));
}

export async function syncPendingAutoRides() {
  const token = await AsyncStorage.getItem(MIRRORED_TOKEN_KEY);
  if (!token) {
    return { uploaded: 0, remaining: await getPendingRideCount() };
  }

  const stored = await AsyncStorage.getItem(AUTO_PENDING_RIDES_KEY);
  const pending: RideUploadPayload[] = stored ? JSON.parse(stored) : [];
  if (!pending.length) {
    return { uploaded: 0, remaining: 0 };
  }

  const remaining: RideUploadPayload[] = [];
  let uploaded = 0;
  for (const ride of pending) {
    try {
      await uploadRidePayload(ride, token);
      uploaded += 1;
    } catch {
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
  return pending.length;
}
