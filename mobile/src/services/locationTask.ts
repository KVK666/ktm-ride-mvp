import AsyncStorage from "@react-native-async-storage/async-storage";
import * as TaskManager from "expo-task-manager";
import { RidePoint } from "../types";

export const BACKGROUND_LOCATION_TASK = "duke-ride-background-location";
export const BACKGROUND_POINTS_KEY = "duke_ride_background_points";

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) {
    return;
  }

  const locations = (data as any).locations || [];
  const stored = await AsyncStorage.getItem(BACKGROUND_POINTS_KEY);
  const existing: RidePoint[] = stored ? JSON.parse(stored) : [];
  const next = locations.map((location: any) => ({
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    altitudeM: location.coords.altitude,
    speedKmh: Math.max(0, (location.coords.speed || 0) * 3.6),
    recordedAt: new Date(location.timestamp).toISOString()
  }));

  await AsyncStorage.setItem(
    BACKGROUND_POINTS_KEY,
    JSON.stringify([...existing, ...next].slice(-4000))
  );
});
