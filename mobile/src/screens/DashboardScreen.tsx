import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { api } from "../api/client";
import { Screen } from "../components/Screen";
import { StatCard } from "../components/StatCard";
import { useAuth } from "../context/AuthContext";
import { hasManualRideSession } from "../services/manualRideSession";
import { ThemeColors } from "../theme/colors";
import { useTheme, useThemedStyles } from "../theme/ThemeContext";
import { DashboardStats, Ride } from "../types";
import { duration, km, kmh, shortDate } from "../utils/format";

export function DashboardScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const displayName = user?.name?.trim() || "Rider";
  const firstName = displayName.split(/\s+/)[0] || displayName;
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentRides, setRecentRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recoverableRide, setRecoverableRide] = useState(false);

  const load = useCallback(async () => {
    try {
      setError("");
      const [response, activeSession] = await Promise.all([
        api<{ stats: DashboardStats; recentRides: Ride[] }>("/dashboard"),
        hasManualRideSession()
      ]);
      setStats(normalizeStats(response.stats));
      setRecentRides(Array.isArray(response.recentRides) ? response.recentRides : []);
      setRecoverableRide(activeSession);
    } catch (err: any) {
      setError(err.message || "Dashboard unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color={colors.orange} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.accent} />}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.kicker}>Welcome back</Text>
            <Text style={styles.title}>Hi, {firstName}</Text>
            <Text style={styles.subtitle}>{user?.bikeModel || "Motorcycle"}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open profile and settings"
            onPress={() => navigation.navigate("More", { screen: "Profile" })}
            style={styles.iconButton}
          >
            <Ionicons name="person" color={colors.accent} size={22} />
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate("Ride")}
          style={({ pressed }) => [styles.rideAction, pressed && styles.pressedCard]}
        >
          <View style={styles.rideActionIcon}>
            <Ionicons name={recoverableRide ? "play" : "radio-button-on"} color={colors.onAccent} size={27} />
          </View>
          <View style={styles.rideText}>
            <Text style={styles.rideActionKicker}>{recoverableRide ? "Ride ready to recover" : "Ready when you are"}</Text>
            <Text style={styles.rideActionTitle}>{recoverableRide ? "Continue your ride" : "Start a new ride"}</Text>
          </View>
          <Ionicons name="arrow-forward" color={colors.accent} size={23} />
        </Pressable>

        {recoverableRide ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate("Ride")}
            style={({ pressed }) => [styles.activeRideCard, pressed && styles.pressedCard]}
          >
            <View style={styles.activeRideIcon}>
              <Ionicons name="radio-button-on" color={colors.text} size={20} />
            </View>
            <View style={styles.rideText}>
              <Text style={styles.reviewTitle}>Ride recording is recoverable</Text>
              <Text style={styles.reviewMeta}>Open Ride and tap Stop Ride to save the stored route.</Text>
            </View>
          </Pressable>
        ) : null}

        <View style={styles.grid}>
          <StatCard label="Today" value={km(stats?.todayDistanceM || 0)} accent={colors.accent} />
          <StatCard label="This month" value={km(stats?.monthDistanceM || 0)} />
          <StatCard label="This year" value={km(stats?.yearDistanceM || 0)} />
          <StatCard label="Total rides" value={`${stats?.totalRides || 0}`} />
          <StatCard label="Best top speed" value={kmh(stats?.bestTopSpeedKmh || 0)} accent={colors.yellow} />
          <StatCard label="Average speed" value={kmh(stats?.averageSpeedKmh || 0)} accent={colors.blue} />
        </View>

        {stats?.unreviewedRides ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate("History")}
            style={({ pressed }) => [styles.reviewCard, pressed && styles.pressedCard]}
          >
            <View style={styles.reviewIcon}>
              <Text style={styles.reviewIconText}>!</Text>
            </View>
            <View style={styles.rideText}>
              <Text style={styles.reviewTitle}>Rides to review</Text>
              <Text style={styles.reviewMeta}>
                {stats.unreviewedRides} {stats.unreviewedRides === 1 ? "ride needs" : "rides need"} a name or review.
              </Text>
            </View>
          </Pressable>
        ) : null}

        <Text style={styles.sectionTitle}>Recent rides</Text>
        {recentRides.map((ride) => (
          <Pressable
            key={ride.id}
            accessibilityRole="button"
            onPress={() => navigation.navigate("RideDetail", { rideId: ride.id })}
            style={({ pressed }) => [styles.rideCard, pressed && styles.pressedCard]}
          >
            <View style={styles.rideText}>
              <Text numberOfLines={2} style={styles.rideTitle}>{rideTitle(ride)}</Text>
              <Text numberOfLines={1} style={styles.rideMeta}>{shortDate(ride.startedAt)} - {duration(ride.durationS)}</Text>
            </View>
            <View style={styles.rideStats}>
              <Text numberOfLines={1} adjustsFontSizeToFit style={styles.rideDistance}>{km(ride.distanceM)}</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit style={styles.rideMeta}>{kmh(ride.topSpeedKmh)}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}

function rideTitle(ride: Ride) {
  return ride.title?.trim() || `${ride.startLabel} to ${ride.endLabel}`;
}

function normalizeStats(stats: any): DashboardStats {
  return {
    todayDistanceM: finiteNumber(stats?.todayDistanceM),
    monthDistanceM: finiteNumber(stats?.monthDistanceM),
    yearDistanceM: finiteNumber(stats?.yearDistanceM),
    totalRides: finiteNumber(stats?.totalRides),
    unreviewedRides: finiteNumber(stats?.unreviewedRides),
    bestTopSpeedKmh: finiteNumber(stats?.bestTopSpeedKmh),
    averageSpeedKmh: finiteNumber(stats?.averageSpeedKmh)
  };
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

const createStyles = (colors: ThemeColors) => ({
  center: {
    alignItems: "center",
    justifyContent: "center"
  },
  content: {
    padding: 16,
    paddingBottom: 110,
    gap: 14
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
    paddingTop: 2
  },
  headerText: {
    flex: 1
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
  subtitle: {
    color: colors.muted,
    marginTop: 2,
    fontSize: 14
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  rideCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
  },
  reviewCard: {
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  activeRideCard: {
    backgroundColor: colors.surface,
    borderColor: colors.success,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  activeRideIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.success
  },
  reviewIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent
  },
  reviewIconText: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 20
  },
  reviewTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900"
  },
  reviewMeta: {
    color: colors.muted,
    marginTop: 2,
    fontSize: 13
  },
  pressedCard: {
    opacity: 0.82
  },
  rideText: {
    flex: 1,
    minWidth: 0
  },
  rideTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800"
  },
  rideMeta: {
    color: colors.muted,
    marginTop: 3,
    fontSize: 13
  },
  rideStats: {
    alignItems: "flex-end",
    flexShrink: 0,
    maxWidth: 112
  },
  rideDistance: {
    color: colors.accent,
    fontWeight: "900",
    fontSize: 16
  },
  error: {
    color: colors.danger
  },
  rideAction: {
    minHeight: 82,
    borderRadius: 18,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surfaceHigh,
    borderColor: colors.borderStrong,
    borderWidth: 1
  },
  rideActionIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent
  },
  rideActionKicker: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  rideActionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 2
  }
});
