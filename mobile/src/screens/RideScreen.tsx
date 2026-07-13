import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { api } from "../api/client";
import { PrimaryButton } from "../components/PrimaryButton";
import { RideMap } from "../components/RideMap";
import { Screen } from "../components/Screen";
import { Metric } from "../components/Metric";
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
import { ThemeColors, typography } from "../theme/colors";
import { useTheme, useThemedStyles } from "../theme/ThemeContext";
import { RidePoint } from "../types";
import { distanceMeters } from "../utils/distance";
import { duration, km, kmh } from "../utils/format";
import { locationToRidePoint } from "../utils/locationPoint";

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
  const [finishVisible, setFinishVisible] = useState(false);
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
  const gpsQuality = gpsQualityLabel(points[points.length - 1], points.length);

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
        const point = locationToRidePoint(location);
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
      const firstPoint = locationToRidePoint(firstLocation);
      if (!firstPoint) {
        throw new Error("Unable to read a valid GPS point");
      }
      await startManualRideSession(firstPoint);
      setPoints([firstPoint]);
      setStartedAt(firstPoint.recordedAt);
      setActive(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setStarting(false);
    }
  }

  async function stopRide() {
    setSaving(true);
    try {
      try {
        const finalLocation = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const finalPoint = locationToRidePoint(finalLocation);
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
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
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        await logDiagnostic({
          level: "warn",
          area: "manual-ride",
          message: "Manual ride queued after save failure",
          details: diagnosticDetails(err)
        });
      } else {
        setMessage(err.message || "Unable to save ride. Check your internet connection.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
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
      <Modal visible={finishVisible} transparent animationType="fade" onRequestClose={() => setFinishVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setFinishVisible(false)}>
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Finish this ride?</Text>
            <Text style={styles.sheetCopy}>RidePulse will stop recording, save every available point, and open your new journal entry.</Text>
            <View style={styles.sheetActions}>
              <Pressable onPress={() => setFinishVisible(false)} style={styles.cancelButton}><Text style={styles.cancelText}>Keep riding</Text></Pressable>
              <PrimaryButton label="Finish & save" icon="checkmark" danger loading={saving} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}); setFinishVisible(false); void stopRide(); }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.recordRow}><View style={[styles.recordDot, active && styles.recordDotActive]} /><Text style={styles.kicker}>{active ? "RECORDING NOW" : "RIDE COCKPIT"}</Text></View>
          <Text style={styles.title}>{active ? "The road is yours" : "Ready when you are"}</Text>
          <Text style={styles.safety}>Set up before moving. Keep your eyes on the road and your phone mounted.</Text>
        </View>

        {message ? <Text style={styles.message}>{message}</Text> : null}
        {autoTracking.error ? <Text style={styles.message}>{autoTracking.error}</Text> : null}

        <View style={styles.mapShell}><RideMap coordinates={compactRidePointsForMap(points)} current={points[points.length - 1]} title={active ? "Live ride route" : "Ride map"} /></View>

        {active ? <View style={styles.speedHero}><Text style={styles.speedValue}>{Math.round(points[points.length - 1]?.speedKmh || 0)}</Text><Text style={styles.speedUnit}>km/h</Text></View> : null}

        <View style={styles.cockpitStatus}>
          <View style={styles.cockpitItem}>
            <Text style={styles.cockpitLabel}>GPS</Text>
            <Text style={styles.cockpitValue}>{gpsQuality}</Text>
          </View>
          <View style={styles.cockpitItem}>
            <Text style={styles.cockpitLabel}>POINTS</Text>
            <Text style={styles.cockpitValue}>{points.length}</Text>
          </View>
          <View style={styles.cockpitItem}>
            <Text style={styles.cockpitLabel}>SAVE STATE</Text>
            <Text style={styles.cockpitValue}>{saving ? "Saving" : active ? "Live" : autoTracking.status.pendingCount ? "Pending" : "Ready"}</Text>
          </View>
        </View>

        <View style={styles.metrics}>
          <Metric label="DISTANCE" value={km(stats.distanceM)} accent />
          <View style={styles.metricDivider} /><Metric label="DURATION" value={duration(stats.durationS)} />
          <View style={styles.metricDivider} /><Metric label="TOP SPEED" value={kmh(stats.topSpeed)} />
        </View>

        {active ? <PrimaryButton block label="Finish ride" icon="stop-circle" danger loading={saving} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); setFinishVisible(true); }} /> : <PrimaryButton block label="Start recording" icon="play" loading={starting} onPress={startRide} />}

        <View style={styles.autoCard}>
          <View style={styles.autoHeader}>
            <View style={styles.autoText}>
              <Text style={styles.autoTitle}>Auto tracking</Text>
              <Text style={styles.autoCopy}>
                {autoTracking.status.enabled
                  ? autoTracking.status.hint || "Armed for motion-first ride detection."
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
          {autoTracking.status.enabled && autoTracking.status.hint ? <Text style={styles.autoHint}>{autoTracking.status.hint}</Text> : null}
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

      </ScrollView>
    </Screen>
  );
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

function gpsQualityLabel(point?: RidePoint, count = 0) {
  if (!point || count === 0) {
    return "Waiting";
  }
  if (point.accuracyM == null) {
    return count >= 2 ? "Locked" : "Warming";
  }
  if (point.accuracyM <= 20) {
    return "Excellent";
  }
  if (point.accuracyM <= 45) {
    return "Good";
  }
  return "Weak";
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

function timestampMs(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

const createStyles = (colors: ThemeColors) => ({
  content: {
    padding: 20,
    paddingBottom: 118,
    gap: 18
  },
  hero: {
    gap: 5,
    paddingTop: 2
  },
  recordRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
  recordDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.muted },
  recordDotActive: { backgroundColor: colors.danger },
  kicker: {
    color: colors.accent,
    fontFamily: typography.bold,
    fontSize: 10,
    letterSpacing: 1.35
  },
  title: {
    color: colors.text,
    fontSize: 32,
    lineHeight: 39,
    fontFamily: typography.extraBold
  },
  safety: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: typography.regular
  },
  mapShell: { height: 340, borderRadius: 28, overflow: "hidden" as const },
  speedHero: { alignItems: "center" as const, justifyContent: "center" as const, paddingVertical: 4 },
  speedValue: { color: colors.text, fontFamily: typography.extraBold, fontSize: 76, lineHeight: 84, letterSpacing: -4 },
  speedUnit: { color: colors.muted, fontFamily: typography.bold, fontSize: 12, letterSpacing: 1.2, marginTop: -4 },
  cockpitStatus: { flexDirection: "row" as const, gap: 10 },
  cockpitItem: { flex: 1, borderRadius: 18, padding: 12, backgroundColor: colors.surfaceHigh },
  cockpitLabel: { color: colors.muted, fontFamily: typography.bold, fontSize: 9, letterSpacing: 1.05 },
  cockpitValue: { color: colors.text, fontFamily: typography.extraBold, fontSize: 15, marginTop: 4 },
  metrics: { flexDirection: "row" as const, alignItems: "center" as const, gap: 12, padding: 17, backgroundColor: colors.surface, borderRadius: 24 },
  metricDivider: { width: 1, height: 42, backgroundColor: colors.border },
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
    borderRadius: 24,
    padding: 17,
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
    fontFamily: typography.extraBold
  },
  autoCopy: {
    color: colors.muted,
    marginTop: 3,
    lineHeight: 18,
    fontSize: 12,
    fontFamily: typography.regular
  },
  autoHint: {
    color: colors.muted,
    lineHeight: 18,
    fontSize: 12,
    fontFamily: typography.medium
  },
  statusRow: {
    flexDirection: "row",
    gap: 10
  },
  statusPill: {
    flex: 1,
    borderRadius: 16,
    padding: 10,
    backgroundColor: colors.surfaceHigh
  },
  statusLabel: {
    color: colors.muted,
    fontSize: 12,
    fontFamily: typography.bold
  },
  statusValue: {
    color: colors.accent,
    fontSize: 14,
    fontFamily: typography.extraBold,
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
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "flex-end" as const },
  sheet: { backgroundColor: colors.elevated, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 22, paddingBottom: 34, gap: 14 },
  sheetHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: "center" as const },
  sheetTitle: { color: colors.text, fontFamily: typography.extraBold, fontSize: 24, marginTop: 5 },
  sheetCopy: { color: colors.muted, fontFamily: typography.regular, lineHeight: 21 },
  sheetActions: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "flex-end" as const, gap: 10, marginTop: 4 },
  cancelButton: { minHeight: 42, paddingHorizontal: 12, justifyContent: "center" as const },
  cancelText: { color: colors.textSoft, fontFamily: typography.bold, fontSize: 13 }
});
