import * as Location from "expo-location";
import React, { useEffect, useMemo, useRef, useState } from "react";
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
import {
  appendManualRidePoints,
  clearManualRideSession,
  compactRidePointsForMap,
  dedupeRidePoints,
  readMergedManualRideSession,
  startManualRideSession
} from "../services/manualRideSession";
import { createRideClientId, queuePendingRide } from "../services/rideUpload";
import { diagnosticDetails, logDiagnostic } from "../services/diagnostics";
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
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const autoTracking = useAutoTracking();
  const subscription = useRef<Location.LocationSubscription | null>(null);
  const restoring = useRef(false);

  const stats = useMemo(() => {
    let distanceM = 0;
    for (let index = 1; index < points.length; index += 1) {
      distanceM += distanceMeters(points[index - 1], points[index]);
    }
    const topSpeed = reliableTopSpeed(points);
    const startMs = startedAt ? timestampMs(startedAt) : Date.now();
    const durationS = active && startMs ? Math.max(0, Math.floor((Date.now() - startMs) / 1000)) : 0;
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

  useEffect(() => {
    restoreActiveRide();
    return () => {
      subscription.current?.remove();
      subscription.current = null;
    };
  }, []);

  async function restoreActiveRide() {
    if (restoring.current) {
      return;
    }

    restoring.current = true;
    try {
      const session = await readMergedManualRideSession();
      if (!session?.points.length) {
        return;
      }

      setPoints(session.points);
      setStartedAt(session.startedAt);
      setActive(true);
      setMessage("Recovered an interrupted ride. Stop Ride will save all locally stored points.");
      await setManualTrackingActive(true);
      await startForegroundWatcher();
      const backgroundGranted = await Location.getBackgroundPermissionsAsync();
      if (backgroundGranted.status === "granted") {
        await startManualBackgroundTracking();
      }
    } catch (err) {
      await logDiagnostic({
        level: "error",
        area: "manual-ride",
        message: "Manual ride restore failed",
        details: diagnosticDetails(err)
      });
    } finally {
      restoring.current = false;
    }
  }

  async function startForegroundWatcher() {
    if (subscription.current) {
      return;
    }

    const foreground = await Location.getForegroundPermissionsAsync();
    if (foreground.status !== "granted") {
      return;
    }

    subscription.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Highest,
        distanceInterval: 10,
        timeInterval: 5000
      },
      (location) => {
        const point = toRidePoint(location);
        if (!point) {
          return;
        }
        void appendManualRidePoints([point]).catch((err) => {
          void logDiagnostic({
            level: "error",
            area: "manual-ride",
            message: "Foreground ride point persistence failed",
            details: diagnosticDetails(err)
          });
        });
        setPoints((current) => dedupeRidePoints([...current, point]));
      }
    );
  }

  async function startRide() {
    if (starting || active) {
      return;
    }

    setStarting(true);
    try {
      await ensurePermissions();
      await clearManualRideSession();
      await setManualTrackingActive(true);

      const firstLocation = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      const firstPoint = toRidePoint(firstLocation);
      if (!firstPoint) {
        throw new Error("Unable to read a valid GPS point");
      }
      await startManualRideSession(firstPoint);
      setPoints([firstPoint]);
      setStartedAt(firstPoint.recordedAt);
      setActive(true);
      await startForegroundWatcher();

      const backgroundGranted = await Location.getBackgroundPermissionsAsync();
      if (backgroundGranted.status === "granted") {
        await startManualBackgroundTracking();
      }
      await refreshAutoTrackingStatus();
    } catch (err: any) {
      await setManualTrackingActive(false).catch((cleanupError) => {
        void logDiagnostic({
          level: "warn",
          area: "manual-ride",
          message: "Manual tracking cleanup failed after start error",
          details: diagnosticDetails(cleanupError)
        });
      });
      setMessage(err.message || "Unable to start ride");
    } finally {
      setStarting(false);
    }
  }

  async function stopRide() {
    setSaving(true);
    try {
      try {
        const finalLocation = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const finalPoint = toRidePoint(finalLocation);
        if (finalPoint) {
          await appendManualRidePoints([finalPoint]);
          setPoints((current) => dedupeRidePoints([...current, finalPoint]));
        }
      } catch {
        // A final point is useful, but stopping must still work without it.
      }

      subscription.current?.remove();
      subscription.current = null;
      await stopManualBackgroundTracking();

      const session = await readMergedManualRideSession();
      const merged = dedupeRidePoints([...(session?.points || []), ...points]);
      const rideStartedAt = session?.startedAt || startedAt;
      if (!rideStartedAt || merged.length < 2) {
        setActive(false);
        setStartedAt(null);
        await clearManualRideSession();
        await refreshAutoTrackingStatus();
        setMessage("Ride is too short to save.");
        return;
      }

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
          clientRideId: createRideClientId("manual", rideStartedAt, endedAt, merged),
          startLabel,
          endLabel,
          startedAt: rideStartedAt,
          endedAt,
          points: merged
        })
      });

      setPoints(merged);
      setActive(false);
      setStartedAt(null);
      await clearManualRideSession();
      await refreshAutoTrackingStatus();
      setMessage("Ride saved. Review the ride before your next trip.");
      navigation.navigate("RideDetail", { rideId: response.rideId, reviewMode: true });
    } catch (err: any) {
      const session = await readMergedManualRideSession();
      const merged = dedupeRidePoints([...(session?.points || []), ...points]);
      const rideStartedAt = session?.startedAt || startedAt || merged[0]?.recordedAt;
      const endedAt = new Date().toISOString();
      if (rideStartedAt && merged.length >= 2) {
        const payload = {
          clientRideId: createRideClientId("manual", rideStartedAt, endedAt, merged),
          startLabel: `Recovered start (${coordinateLabel(merged[0])})`,
          endLabel: `Recovered end (${coordinateLabel(merged[merged.length - 1])})`,
          startedAt: rideStartedAt,
          endedAt,
          points: merged
        };
        try {
          await queuePendingRide(payload);
          await clearManualRideSession();
        } catch (queueError) {
          await logDiagnostic({
            level: "error",
            area: "manual-ride",
            message: "Manual ride local queue failed after save failure",
            details: diagnosticDetails(queueError)
          });
          setMessage("Unable to upload or queue this ride. Keep the app open and try Stop Ride again.");
          return;
        }
        setPoints(merged);
        setActive(false);
        setStartedAt(null);
        await refreshAutoTrackingStatus();
        setMessage("Ride saved locally. It will upload automatically when the backend is reachable.");
        await logDiagnostic({
          level: "warn",
          area: "manual-ride",
          message: "Manual ride queued after save failure",
          details: diagnosticDetails(err)
        });
      } else {
        setMessage(err.message || "Unable to save ride. Check your internet connection.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function refreshAutoTrackingStatus() {
    try {
      await autoTracking.refresh();
    } catch (err) {
      await logDiagnostic({
        level: "warn",
        area: "auto-tracking",
        message: "Auto tracking status refresh failed",
        details: diagnosticDetails(err)
      });
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
              thumbColor={autoTracking.status.enabled ? colors.accent : colors.muted}
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
            <View style={styles.pendingUploadBox}>
              <Text style={styles.pendingText}>
                {autoTracking.status.pendingCount} ride waiting to upload.
              </Text>
              <PrimaryButton
                label="Retry upload now"
                icon="cloud-upload"
                loading={autoTracking.loading}
                onPress={autoTracking.retryPendingUploads}
              />
            </View>
          ) : null}
          {autoTracking.syncMessage ? <Text style={styles.successText}>{autoTracking.syncMessage}</Text> : null}
        </View>

        <RideMap
          coordinates={compactRidePointsForMap(points)}
          current={points[points.length - 1]}
          title={active ? "Live ride route" : "Ride map"}
        />

        <View style={styles.grid}>
          <StatCard label="Distance" value={km(stats.distanceM)} accent={colors.accent} />
          <StatCard label="Duration" value={duration(stats.durationS)} />
          <StatCard label="Top speed" value={kmh(stats.topSpeed)} accent={colors.yellow} />
          <StatCard label="Average" value={kmh(stats.avgSpeed)} accent={colors.blue} />
        </View>

        {active ? (
          <PrimaryButton label="Stop Ride" icon="stop-circle" danger loading={saving} onPress={stopRide} />
        ) : (
          <PrimaryButton label="Start Ride" icon="play-circle" loading={starting} onPress={startRide} />
        )}
      </ScrollView>
    </Screen>
  );
}

function toRidePoint(location: Location.LocationObject): RidePoint | null {
  const latitude = Number(location?.coords?.latitude);
  const longitude = Number(location?.coords?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const timestamp = Number(location.timestamp);
  return {
    latitude,
    longitude,
    altitudeM: optionalNumber(location.coords.altitude),
    accuracyM: optionalNumber(location.coords.accuracy),
    speedKmh: Math.max(0, optionalNumber(location.coords.speed) || 0) * 3.6,
    recordedAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString()
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
      const gapMs = Math.abs(timestampMs(other.point.recordedAt) - timestampMs(candidate.point.recordedAt));
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
  if (speed == null || !Number.isFinite(speed) || speed < 0 || speed > MAX_REASONABLE_SPEED_KMH) {
    return null;
  }
  if (point.accuracyM != null && point.accuracyM > MAX_SPEED_ACCURACY_M) {
    return null;
  }
  return speed;
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
  const latitude = Number.isFinite(point.latitude) ? point.latitude : 0;
  const longitude = Number.isFinite(point.longitude) ? point.longitude : 0;
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

function optionalNumber(value: unknown) {
  if (value == null) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function timestampMs(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

const createStyles = (colors: ThemeColors) => ({
  content: {
    padding: 16,
    paddingBottom: 110,
    gap: 14
  },
  hero: {
    gap: 6,
    padding: 15,
    borderRadius: 18,
    backgroundColor: colors.surfaceHigh,
    borderColor: colors.borderStrong,
    borderWidth: 1
  },
  kicker: {
    color: colors.accent,
    fontWeight: "900",
    fontSize: 11,
    textTransform: "uppercase"
  },
  title: {
    color: colors.text,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "900"
  },
  safety: {
    color: colors.muted,
    fontSize: 13
  },
  message: {
    color: colors.yellow,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 10,
    borderColor: colors.border,
    borderWidth: 1
  },
  autoCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 12
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
    fontSize: 17,
    fontWeight: "900"
  },
  autoCopy: {
    color: colors.muted,
    marginTop: 3,
    lineHeight: 18,
    fontSize: 13
  },
  statusRow: {
    flexDirection: "row",
    gap: 10
  },
  statusPill: {
    flex: 1,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    backgroundColor: colors.surfaceHigh
  },
  statusLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800"
  },
  statusValue: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: "900",
    marginTop: 3
  },
  pendingText: {
    color: colors.yellow,
    fontWeight: "700"
  },
  pendingUploadBox: {
    gap: 10
  },
  successText: {
    color: colors.success,
    fontWeight: "800"
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  }
});
