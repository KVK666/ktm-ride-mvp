import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../api/client";
import { Screen } from "../components/Screen";
import { StatCard } from "../components/StatCard";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme/colors";
import { DashboardStats, Ride } from "../types";
import { duration, km, kmh, shortDate } from "../utils/format";

export function DashboardScreen() {
  const navigation = useNavigation<any>();
  const { user, logout } = useAuth();
  const displayName = user?.name?.trim() || "Rider";
  const firstName = displayName.split(/\s+/)[0] || displayName;
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentRides, setRecentRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const response = await api<{ stats: DashboardStats; recentRides: Ride[] }>("/dashboard");
      setStats(response.stats);
      setRecentRides(response.recentRides);
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
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.orange} />}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.kicker}>Welcome back</Text>
            <Text style={styles.title}>Hi, {firstName}</Text>
            <Text style={styles.subtitle}>{user?.bikeModel || "KTM Duke 250 Gen 3"}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Logout" onPress={logout} style={styles.iconButton}>
            <Ionicons name="exit" color={colors.text} size={22} />
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.grid}>
          <StatCard label="Today" value={km(stats?.todayDistanceM || 0)} accent={colors.orange} />
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

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    justifyContent: "center"
  },
  content: {
    padding: 18,
    gap: 18
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1
  },
  headerText: {
    flex: 1
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
  subtitle: {
    color: colors.muted,
    marginTop: 3
  },
  iconButton: {
    width: 46,
    height: 46,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceHigh,
    borderColor: colors.border,
    borderWidth: 1
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "900"
  },
  rideCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
  },
  reviewCard: {
    backgroundColor: colors.surface,
    borderColor: colors.orange,
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  reviewIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.orange
  },
  reviewIconText: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 20
  },
  reviewTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900"
  },
  reviewMeta: {
    color: colors.muted,
    marginTop: 3
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
    fontSize: 15,
    fontWeight: "800"
  },
  rideMeta: {
    color: colors.muted,
    marginTop: 4
  },
  rideStats: {
    alignItems: "flex-end",
    flexShrink: 0,
    maxWidth: 112
  },
  rideDistance: {
    color: colors.orange,
    fontWeight: "900",
    fontSize: 18
  },
  error: {
    color: colors.danger
  }
});
