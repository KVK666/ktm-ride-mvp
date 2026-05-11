import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../api/client";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { StatCard } from "../components/StatCard";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme/colors";
import { DashboardStats, Ride } from "../types";
import { duration, km, kmh, shortDate } from "../utils/format";

export function DashboardScreen() {
  const { user, logout } = useAuth();
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
          <View>
            <Text style={styles.kicker}>{user?.bikeModel}</Text>
            <Text style={styles.title}>Ride dashboard</Text>
          </View>
          <PrimaryButton label="Logout" icon="exit" onPress={logout} />
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

        <Text style={styles.sectionTitle}>Recent rides</Text>
        {recentRides.map((ride) => (
          <View key={ride.id} style={styles.rideCard}>
            <View>
              <Text style={styles.rideTitle}>{ride.startLabel} to {ride.endLabel}</Text>
              <Text style={styles.rideMeta}>{shortDate(ride.startedAt)} - {duration(ride.durationS)}</Text>
            </View>
            <View style={styles.rideStats}>
              <Text style={styles.rideDistance}>{km(ride.distanceM)}</Text>
              <Text style={styles.rideMeta}>{kmh(ride.topSpeedKmh)}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    justifyContent: "center"
  },
  content: {
    padding: 16,
    gap: 16
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12
  },
  kicker: {
    color: colors.orange,
    fontWeight: "800",
    fontSize: 12
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900"
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900"
  },
  rideCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
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
    alignItems: "flex-end"
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
