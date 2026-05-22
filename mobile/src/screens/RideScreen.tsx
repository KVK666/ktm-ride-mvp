import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import React, { useMemo, useRef, useState } from "react";
import { ScrollView, Switch, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { api } from "../api/client";
import { PrimaryButton } from "../components/PrimaryButton";
import { RideMap } from "../components/RideMap";
import { Screen } from "../components/Screen";
import { StatCard } from "../components/StatCard";
import { useAutoTracking } from "../hooks/useAutoTracking";
import {
  setManualTrackingActive,
  startManualBackgroundTracking,
  stopManualBackgroundTracking
} from "../services/autoRideTracking";
import { BACKGROUND_POINTS_KEY } from "../services/trackingKeys";
import { createRideClientId } from "../services/rideUpload";
import { ThemeColors } from "../theme/colors";
import { useTheme, useThemedStyles } from "../theme/ThemeContext";
import { RidePoint } from "../types";
import { distanceMeters } from "../utils/distance";
import { duration, km, kmh } from "../utils/format";

const MAX_REASONABLE_SPEED_KMH = 250;
const MAX_SPEED_ACCURACY_M = 35;
const SPEED_SUPPORT_WINDOW_MS = 12000;

export function RideScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<any>();
  const [active, setActive] = useState(false);
  const [points, setPoints] = useState<RidePoint[]>([]);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const autoTracking = useAutoTracking();
  const subscription = useRef<Location.LocationSubscription | null>(null);

  const stats = useMemo(() => {
    let distanceM = 0;
    for (let index = 1; index < points.length; index += 1) {
      distanceM += distanceMeters(points[index - 1], points[index]);
    }
    const topSpeed = reliableTopSpeed(points);
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
      await setManualTrackingActive(true);
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
        await startManualBackgroundTracking();
      }
      await autoTracking.refresh();
    } catch (err: any) {
      await setManualTrackingActive(false);
      setMessage(err.message || "Unable to start ride");
    }
  }

  async function stopRide() {
    if (!startedAt || points.length < 2) {
      setActive(false);
      subscription.current?.remove();
      subscription.current = null;
      await stopManualBackgroundTracking();
      setMessage("Ride is too short to save.");
      return;
    }

      setSaving(true);
    try {
      subscription.current?.remove();
      subscription.current = null;
      await stopManualBackgroundTracking();

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

      const response = await api<{ rideId: string; duplicate?: boolean }>("/rides", {
        method: "POST",
        body: JSON.stringify({
          clientRideId: createRideClientId("manual", startedAt, endedAt, merged),
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
      await autoTracking.refresh();
      setMessage("Ride saved. Review the ride before your next trip.");
      navigation.navigate("RideDetail", { rideId: response.rideId, reviewMode: true });
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
        {autoTracking.error ? <Text style={styles.message}>{autoTracking.error}</Text> : null}

        <View style={styles.autoCard}>
          <View style={styles.autoHeader}>
            <View style={styles.autoText}>
              <Text style={styles.autoTitle}>Auto tracking</Text>
              <Text style={styles.autoCopy}>
                {autoTracking.status.enabled
                  ? "Watching for sustained riding movement in the background."
                  : "Off by default. Enable before riding when you want hands-free ride logs."}
              </Text>
            </View>
            <Switch
              value={autoTracking.status.enabled}
              disabled={autoTracking.loading || active}
              onValueChange={autoTracking.toggle}
              thumbColor={autoTracking.status.enabled ? colors.orange : colors.muted}
              trackColor={{ false: colors.border, true: colors.surfaceHigh }}
            />
          </View>
          <View style={styles.statusRow}>
            <View style={styles.statusPill}>
              <Text style={styles.statusLabel}>Manual</Text>
              <Text style={styles.statusValue}>{active ? "Recording" : "Ready"}</Text>
            </View>
            <View style={styles.statusPill}>
              <Text style={styles.statusLabel}>Automatic</Text>
              <Text style={styles.statusValue}>{autoTracking.status.label}</Text>
            </View>
          </View>
          {autoTracking.status.pendingCount ? (
            <Text style={styles.pendingText}>{autoTracking.status.pendingCount} ride waiting to upload.</Text>
          ) : null}
        </View>

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
    accuracyM: location.coords.accuracy,
    speedKmh: Math.max(0, (location.coords.speed || 0) * 3.6),
    recordedAt: new Date(location.timestamp).toISOString()
  };
}

function reliableTopSpeed(points: RidePoint[]) {
  const candidates = points
    .map((point, index) => ({ point, index, speed: validSpeed(point) }))
    .filter((item) => item.speed != null);

  if (!candidates.length) {
    return 0;
  }

  let best = 0;
  for (const candidate of candidates) {
    const supported = candidates.some((other) => {
      if (other.index === candidate.index || other.speed == null || candidate.speed == null) {
        return false;
      }
      const gapMs = Math.abs(new Date(other.point.recordedAt).getTime() - new Date(candidate.point.recordedAt).getTime());
      return gapMs <= SPEED_SUPPORT_WINDOW_MS && other.speed >= candidate.speed * 0.75;
    });
    if (supported) {
      best = Math.max(best, candidate.speed || 0);
    }
  }

  return best || Math.max(...candidates.map((candidate) => candidate.speed || 0));
}

function validSpeed(point: RidePoint) {
  const speed = point.speedKmh;
  if (speed == null || speed < 0 || speed > MAX_REASONABLE_SPEED_KMH) {
    return null;
  }
  if (point.accuracyM != null && point.accuracyM > MAX_SPEED_ACCURACY_M) {
    return null;
  }
  return speed;
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

const createStyles = (colors: ThemeColors) => ({
  content: {
    padding: 18,
    gap: 18
  },
  hero: {
    gap: 6,
    padding: 16,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1
  },
  kicker: {
    color: colors.orange,
    fontWeight: "900",
    fontSize: 11,
    textTransform: "uppercase"
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
    padding: 12,
    borderColor: colors.border,
    borderWidth: 1
  },
  autoCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    gap: 14
  },
  autoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  autoText: {
    flex: 1
  },
  autoTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "900"
  },
  autoCopy: {
    color: colors.muted,
    marginTop: 4,
    lineHeight: 19
  },
  statusRow: {
    flexDirection: "row",
    gap: 12
  },
  statusPill: {
    flex: 1,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    backgroundColor: colors.surfaceHigh
  },
  statusLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800"
  },
  statusValue: {
    color: colors.orange,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 4
  },
  pendingText: {
    color: colors.yellow,
    fontWeight: "700"
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  }
});
