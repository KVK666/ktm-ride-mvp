import * as Location from "expo-location";
import { RidePoint } from "../types";
import { optionalFiniteNumber } from "./normalize";

export function locationToRidePoint(location: Location.LocationObject): RidePoint | null {
  const latitude = Number(location?.coords?.latitude);
  const longitude = Number(location?.coords?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const timestamp = Number(location.timestamp);
  return {
    latitude,
    longitude,
    altitudeM: optionalFiniteNumber(location.coords.altitude),
    accuracyM: optionalFiniteNumber(location.coords.accuracy),
    speedKmh: Math.max(0, optionalFiniteNumber(location.coords.speed) || 0) * 3.6,
    recordedAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString()
  };
}
