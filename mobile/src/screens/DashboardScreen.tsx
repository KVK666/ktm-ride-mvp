import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../api/client";
import { JournalCard } from "../components/JournalCard";
import { Metric } from "../components/Metric";
import { Screen } from "../components/Screen";
import { useAuth } from "../context/AuthContext";
import { hasManualRideSession } from "../services/manualRideSession";
import { typography } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { DashboardStats, Ride } from "../types";
import { km } from "../utils/format";

export function DashboardScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const firstName = (user?.name?.trim() || "Rider").split(/\s+/)[0];
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentRides, setRecentRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [recoverableRide, setRecoverableRide] = useState(false);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
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
      setError(err.message || "Your journal is unavailable right now");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const latestRide = recentRides[0];
  const previousMonth = stats?.previousMonthDistanceM || 0;
  const monthChange = previousMonth > 0 ? Math.round((((stats?.monthDistanceM || 0) - previousMonth) / previousMonth) * 100) : null;
  const longest = latestRide && stats?.longestRideDistanceM && latestRide.distanceM >= stats.longestRideDistanceM * 0.999;

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.accent} />}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={[styles.eyebrow, { color: colors.muted }]}>GOOD TO SEE YOU</Text>
            <Text style={[styles.title, { color: colors.text }]}>Ready, {firstName}?</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>{user?.bikeModel || "Your motorcycle"}</Text>
          </View>
          <Pressable accessibilityLabel="Open your profile" onPress={() => navigation.navigate("More", { screen: "Profile" })} style={[styles.avatar, { backgroundColor: colors.surfaceHigh }]}>
            <Text style={[styles.avatarText, { color: colors.accent }]}>{firstName.charAt(0).toUpperCase()}</Text>
          </Pressable>
        </View>

        {error ? (
          <Pressable onPress={() => load()} style={[styles.banner, { backgroundColor: `${colors.danger}16` }]}>
            <Ionicons name="cloud-offline" color={colors.danger} size={20} />
            <View style={styles.flex}><Text style={[styles.bannerTitle, { color: colors.text }]}>Couldn’t refresh your journal</Text><Text style={[styles.bannerCopy, { color: colors.muted }]}>{error} · Tap to retry</Text></View>
          </Pressable>
        ) : null}

        <Pressable onPress={() => navigation.navigate("Ride")} style={({ pressed }) => [styles.startRide, { backgroundColor: colors.accent }, pressed && styles.pressed]}>
          <View style={styles.startIcon}><Ionicons name={recoverableRide ? "play" : "radio-button-on"} color={colors.onAccent} size={24} /></View>
          <View style={styles.flex}>
            <Text style={[styles.startKicker, { color: colors.onAccent }]}>{recoverableRide ? "RECOVERABLE RIDE" : "THE ROAD IS OPEN"}</Text>
            <Text style={[styles.startTitle, { color: colors.onAccent }]}>{recoverableRide ? "Continue recording" : "Start a ride"}</Text>
          </View>
          <Ionicons name="arrow-forward" color={colors.onAccent} size={24} />
        </Pressable>

        {loading ? (
          <View style={[styles.loadingCard, { backgroundColor: colors.surface }]}><ActivityIndicator color={colors.accent} /><Text style={[styles.loadingText, { color: colors.muted }]}>Opening your journal</Text></View>
        ) : latestRide ? (
          <View style={styles.section}>
            <View style={styles.sectionHeading}><Text style={[styles.sectionTitle, { color: colors.text }]}>Latest journey</Text><Text style={[styles.sectionMeta, { color: colors.muted }]}>Your road, remembered</Text></View>
            <JournalCard featured ride={latestRide} onPress={() => navigation.navigate("RideDetail", { rideId: latestRide.id })} />
          </View>
        ) : (
          <View style={[styles.empty, { backgroundColor: colors.surface }]}>
            <Ionicons name="map-outline" color={colors.accent} size={30} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Your first route starts here</Text>
            <Text style={[styles.emptyCopy, { color: colors.muted }]}>Record a ride and RidePulse will turn the route into a journal you can revisit.</Text>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeading}><Text style={[styles.sectionTitle, { color: colors.text }]}>This month</Text><Text style={[styles.sectionMeta, { color: colors.muted }]}>{monthChange == null ? "A fresh chapter" : `${monthChange >= 0 ? "+" : ""}${monthChange}% vs last month`}</Text></View>
          <View style={[styles.metrics, { backgroundColor: colors.surface }]}>
            <Metric label="DISTANCE" value={km(stats?.monthDistanceM || 0)} accent />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Metric label="ALL RIDES" value={String(stats?.totalRides || 0)} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Metric label="BEST SPEED" value={`${Math.round(stats?.bestTopSpeedKmh || 0)} km/h`} />
          </View>
        </View>

        {(longest || isRideMilestone(stats?.totalRides || 0) || stats?.unreviewedRides) ? (
          <View style={[styles.highlight, { backgroundColor: colors.surfaceHigh }]}>
            <View style={[styles.highlightIcon, { backgroundColor: `${colors.accent}1F` }]}><Ionicons name={longest ? "trophy" : stats?.unreviewedRides ? "sparkles" : "flag"} color={colors.accent} size={21} /></View>
            <View style={styles.flex}>
              <Text style={[styles.highlightTitle, { color: colors.text }]}>{longest ? "A new personal distance best" : stats?.unreviewedRides ? `${stats.unreviewedRides} ${stats.unreviewedRides === 1 ? "journey" : "journeys"} waiting for your story` : `${stats?.totalRides} rides recorded`}</Text>
              <Text style={[styles.highlightCopy, { color: colors.muted }]}>{longest ? "That latest route is your longest ride yet." : stats?.unreviewedRides ? "Add a name or note while the road is still fresh." : "A quiet milestone worth remembering."}</Text>
            </View>
          </View>
        ) : null}

        {recentRides.length > 1 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeading}><Text style={[styles.sectionTitle, { color: colors.text }]}>Recent journeys</Text><Pressable onPress={() => navigation.navigate("History")}><Text style={[styles.seeAll, { color: colors.accent }]}>See journal</Text></Pressable></View>
            {recentRides.slice(1, 4).map((ride) => <JournalCard key={ride.id} ride={ride} onPress={() => navigation.navigate("RideDetail", { rideId: ride.id })} />)}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function normalizeStats(stats: any): DashboardStats {
  const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
  return {
    todayDistanceM: number(stats?.todayDistanceM), monthDistanceM: number(stats?.monthDistanceM), yearDistanceM: number(stats?.yearDistanceM),
    totalRides: number(stats?.totalRides), unreviewedRides: number(stats?.unreviewedRides), bestTopSpeedKmh: number(stats?.bestTopSpeedKmh),
    averageSpeedKmh: number(stats?.averageSpeedKmh), previousMonthDistanceM: number(stats?.previousMonthDistanceM), longestRideDistanceM: number(stats?.longestRideDistanceM)
  };
}

function isRideMilestone(count: number) { return [1, 5, 10, 25, 50, 100, 250, 500].includes(count); }

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 118, gap: 26 },
  header: { flexDirection: "row", alignItems: "center", gap: 16, paddingTop: 2 }, headerText: { flex: 1 }, flex: { flex: 1 },
  eyebrow: { fontFamily: typography.bold, fontSize: 10, letterSpacing: 1.4 }, title: { fontFamily: typography.extraBold, fontSize: 31, lineHeight: 38, marginTop: 3 }, subtitle: { fontFamily: typography.medium, fontSize: 13, marginTop: 1 },
  avatar: { width: 48, height: 48, borderRadius: 18, alignItems: "center", justifyContent: "center" }, avatarText: { fontFamily: typography.extraBold, fontSize: 18 },
  startRide: { minHeight: 88, borderRadius: 26, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }, startIcon: { width: 44, height: 44, borderRadius: 15, borderWidth: 1, borderColor: "rgba(0,0,0,0.16)", alignItems: "center", justifyContent: "center" },
  startKicker: { fontFamily: typography.bold, fontSize: 9, letterSpacing: 1.2, opacity: 0.68 }, startTitle: { fontFamily: typography.extraBold, fontSize: 19, marginTop: 2 },
  section: { gap: 14 }, sectionHeading: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }, sectionTitle: { fontFamily: typography.extraBold, fontSize: 20 }, sectionMeta: { fontFamily: typography.medium, fontSize: 11 }, seeAll: { fontFamily: typography.bold, fontSize: 12 },
  metrics: { flexDirection: "row", alignItems: "center", padding: 17, borderRadius: 24, gap: 12 }, divider: { width: 1, height: 42 },
  highlight: { flexDirection: "row", alignItems: "center", borderRadius: 24, padding: 16, gap: 13 }, highlightIcon: { width: 44, height: 44, borderRadius: 16, alignItems: "center", justifyContent: "center" }, highlightTitle: { fontFamily: typography.bold, fontSize: 14 }, highlightCopy: { fontFamily: typography.regular, fontSize: 12, lineHeight: 17, marginTop: 3 },
  banner: { flexDirection: "row", gap: 12, padding: 15, borderRadius: 20 }, bannerTitle: { fontFamily: typography.bold, fontSize: 13 }, bannerCopy: { fontFamily: typography.regular, fontSize: 11, marginTop: 2 },
  loadingCard: { height: 210, borderRadius: 26, alignItems: "center", justifyContent: "center", gap: 10 }, loadingText: { fontFamily: typography.medium },
  empty: { padding: 26, borderRadius: 26, gap: 9 }, emptyTitle: { fontFamily: typography.extraBold, fontSize: 20 }, emptyCopy: { fontFamily: typography.regular, fontSize: 13, lineHeight: 20 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.992 }] }
});
