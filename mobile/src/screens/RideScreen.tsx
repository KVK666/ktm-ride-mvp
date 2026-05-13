import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import React, { useMemo, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../api/client";
import { PrimaryButton } from "../components/PrimaryButton";
import { RideMap } from "../components/RideMap";
import { Screen } from "../components/Screen";
import { StatCard } from "../components/StatCard";
import { BACKGROUND_LOCATION_TASK, BACKGROUND_POINTS_KEY } from "../services/locationTask";
import { colors } from "../theme/colors";
import { RidePoint } from "../types";
import { distanceMeters } from "../utils/distance";
import { duration, km, kmh } from "../utils/format";

export function RideScreen() {
  const [active, setActive] = useState(false);
  const [points, setPoints] = useState<RidePoint[]>([]);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const subscription = useRef<Location.LocationSubscription | null>(null);

  const stats = useMemo(() => {
    let distanceM = 0;
    let topSpeed = 0;
    for (let index = 1; index < points.length; index += 1) {
      distanceM += distanceMeters(points[index - 1], points[index]);
      topSpeed = Math.max(topSpeed, points[index].speedKmh || 0);
    }
    const startMs = startedAt ? new Date(startedAt).getTime() : Date.now();
    const durationS = active ? Math.floor((Date.now() - startMs) / 1000) : 0;
    const avgSpeed = durationS > 0 ? (distanceM / 1000 / (durationS / 3600)) : 0;
    return { distanceM, topSpeed, durationS, avgSpeed };
  }, [active, points, startedAt]);

  async function ensurePermissions() {
    const foreground = await Location.requestForegroundPermissionsAsync();
    if (foreground.status !== "granted") {
      throw new Error("Location permission is required for ride tracking");
    }

    const background = await Location.requestBackgroundPermissionsAsync();
    if (background.status !== "granted") {
      setMessage("Background location is off. Foreground tracking will work, but keep the app open while riding.");
    } else {
      setMessage("Background tracking enabled. Disable battery optimization for the most reliable ride logs.");
    }
  }

  async function startRide() {
    try {
      await ensurePermissions();
      await AsyncStorage.removeItem(BACKGROUND_POINTS_KEY);

      const firstLocation = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      const firstPoint = toRidePoint(firstLocation);
      setPoints([firstPoint]);
      setStartedAt(firstPoint.recordedAt);
      setActive(true);

      subscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Highest,
          distanceInterval: 8,
          timeInterval: 3000
        },
        (location) => setPoints((current) => [...current, toRidePoint(location)])
      );

      const backgroundGranted = await Location.getBackgroundPermissionsAsync();
      if (backgroundGranted.status === "granted") {
        const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        if (!alreadyRunning) {
          await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
            accuracy: Location.Accuracy.Highest,
            distanceInterval: 10,
            timeInterval: 5000,
            showsBackgroundLocationIndicator: true,
            foregroundService: {
              notificationTitle: "Duke Ride tracking",
              notificationBody: "Ride tracking is active."
            }
          });
        }
      }
    } catch (err: any) {
      setMessage(err.message || "Unable to start ride");
    }
  }

  async function stopRide() {
    if (!startedAt || points.length < 2) {
      setActive(false);
      setMessage("Ride is too short to save.");
      return;
    }

    setSaving(true);
    try {
      subscription.current?.remove();
      subscription.current = null;
      const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (running) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      }

      const stored = await AsyncStorage.getItem(BACKGROUND_POINTS_KEY);
      const backgroundPoints: RidePoint[] = stored ? JSON.parse(stored) : [];
      const merged = dedupePoints([...points, ...backgroundPoints]);
      const endedAt = new Date().toISOString();
      const startPoint = merged[0];
      const endPoint = merged[merged.length - 1];
      const [startLabel, endLabel] = await Promise.all([
        getRidePointLabel(startPoint, "Start point"),
        getRidePointLabel(endPoint, "End point")
      ]);

      await api("/rides", {
        method: "POST",
        body: JSON.stringify({
          startLabel,
          endLabel,
          startedAt,
          endedAt,
          points: merged
        })
      });

      setPoints(merged);
      setActive(false);
      setStartedAt(null);
      await AsyncStorage.removeItem(BACKGROUND_POINTS_KEY);
      Alert.alert("Ride saved", "Your ride was added to history and dashboard stats.");
    } catch (err: any) {
      setMessage(err.message || "Unable to save ride. Check your internet connection.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>Live ride tracking</Text>
          <Text style={styles.title}>{active ? "Ride in progress" : "Ready to ride"}</Text>
          <Text style={styles.safety}>Set your phone up before moving and keep interactions off the road.</Text>
        </View>

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <RideMap
          coordinates={points}
          current={points[points.length - 1]}
          title={active ? "Live ride route" : "Ride map"}
        />

        <View style={styles.grid}>
          <StatCard label="Distance" value={km(stats.distanceM)} accent={colors.orange} />
          <StatCard label="Duration" value={duration(stats.durationS)} />
          <StatCard label="Top speed" value={kmh(stats.topSpeed)} accent={colors.yellow} />
          <StatCard label="Average" value={kmh(stats.avgSpeed)} accent={colors.blue} />
        </View>

        {active ? (
          <PrimaryButton label="Stop Ride" icon="stop-circle" danger loading={saving} onPress={stopRide} />
        ) : (
          <PrimaryButton label="Start Ride" icon="play-circle" onPress={startRide} />
        )}
      </ScrollView>
    </Screen>
  );
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

function dedupePoints(points: RidePoint[]) {
  const seen = new Set<string>();
  return points
    .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime())
    .filter((point) => {
      const key = `${point.recordedAt}-${point.latitude}-${point.longitude}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

async function getRidePointLabel(point: RidePoint, fallback: string) {
  try {
    const places = await Location.reverseGeocodeAsync({
      latitude: point.latitude,
      longitude: point.longitude
    });
    const place = places[0];
    if (!place) {
      return coordinateLabel(point);
    }

    const main = place.name || place.street || place.district || place.city || place.region;
    const area = [place.city, place.region].filter(Boolean).join(", ");
    const label = [main, area && area !== main ? area : null].filter(Boolean).join(", ");
    return label || coordinateLabel(point);
  } catch {
    return fallback ? `${fallback} (${coordinateLabel(point)})` : coordinateLabel(point);
  }
}

function coordinateLabel(point: RidePoint) {
  return `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`;
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 16
  },
  hero: {
    gap: 5
  },
  kicker: {
    color: colors.orange,
    fontWeight: "900"
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "900"
  },
  safety: {
    color: colors.muted,
    fontSize: 14
  },
  message: {
    color: colors.yellow,
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 12
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  }
});
