import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../api/client";
import { InlineSkeleton } from "../components/InlineSkeleton";
import { JournalCard } from "../components/JournalCard";
import { JournalHero } from "../components/JournalHero";
import { MemoryCard } from "../components/MemoryCard";
import { Metric } from "../components/Metric";
import { PremiumEmptyState } from "../components/PremiumEmptyState";
import { ProfileAvatar } from "../components/ProfileAvatar";
import { RideSlideshowModal } from "../components/RideSlideshowModal";
import { SmartHighlight } from "../components/SmartHighlight";
import { Screen } from "../components/Screen";
import { useAuth } from "../context/AuthContext";
import { buildRideMemories, getRideAlbum } from "../services/rideAlbums";
import { hasManualRideSession } from "../services/manualRideSession";
import { typography } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { DashboardStats, JournalHighlight, JournalResponse, Ride, RideAlbumPhoto, RideMemory } from "../types";
import { km } from "../utils/format";

export function DashboardScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const firstName = (user?.name?.trim() || "Rider").split(/\s+/)[0];
  const [journal, setJournal] = useState<JournalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [recoverableRide, setRecoverableRide] = useState(false);
  const [memories, setMemories] = useState<RideMemory[]>([]);
  const [selectedMemory, setSelectedMemory] = useState<RideMemory | null>(null);
  const [selectedMemoryPhotos, setSelectedMemoryPhotos] = useState<RideAlbumPhoto[]>([]);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      setError("");
      const [response, activeSession] = await Promise.all([loadJournalWithFallback(), hasManualRideSession()]);
      setJournal(response);
      setMemories(await buildRideMemories(response.recentRides || []));
      setRecoverableRide(activeSession);
    } catch (err: any) {
      setError(err.message || "Your journal is unavailable right now");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const latestRide = journal?.latestRide || journal?.recentRides?.[0] || null;
  const highlights = journal?.highlights || [];
  const monthChange = journal?.monthlyRecap?.distanceDeltaPercent;

  async function openMemory(memory: RideMemory) {
    if (!memory.ride) {
      return;
    }
    const album = await getRideAlbum(memory.ride.id);
    setSelectedMemoryPhotos(album?.photos || []);
    setSelectedMemory(memory);
  }

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.accent} />}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={[styles.eyebrow, { color: colors.accent }]}>RIDEPULSE JOURNAL</Text>
            <Text style={[styles.title, { color: colors.text }]}>The road remembers, {firstName}.</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>{user?.bikeModel || "Your motorcycle"} · Smart ride journal</Text>
          </View>
          <Pressable accessibilityLabel="Open your profile" onPress={() => navigation.navigate("More", { screen: "Profile" })} style={[styles.avatar, { backgroundColor: colors.surfaceHigh }]}>
            <ProfileAvatar user={user} size={48} radius={18} />
          </Pressable>
        </View>

        {error ? (
          <Pressable onPress={() => load()} style={[styles.banner, { backgroundColor: `${colors.danger}16` }]}>
            <Ionicons name="cloud-offline" color={colors.danger} size={20} />
            <View style={styles.flex}><Text style={[styles.bannerTitle, { color: colors.text }]}>Couldn’t refresh your smart journal</Text><Text style={[styles.bannerCopy, { color: colors.muted }]}>{error} · Tap to retry</Text></View>
          </Pressable>
        ) : null}

        <Pressable onPress={() => navigation.navigate("Ride")} style={({ pressed }) => [styles.startRide, { backgroundColor: colors.accent }, pressed && styles.pressed]}>
          <View style={styles.startIcon}><Ionicons name={recoverableRide ? "play" : "radio-button-on"} color={colors.onAccent} size={24} /></View>
          <View style={styles.flex}>
            <Text style={[styles.startKicker, { color: colors.onAccent }]}>{recoverableRide ? "RECOVERABLE RIDE" : "READY TO RECORD"}</Text>
            <Text style={[styles.startTitle, { color: colors.onAccent }]}>{recoverableRide ? "Continue your saved ride" : "Start a new chapter"}</Text>
          </View>
          <Ionicons name="arrow-forward" color={colors.onAccent} size={24} />
        </Pressable>

        {loading ? (
          <View style={[styles.skeletonCard, { backgroundColor: colors.surface }]}>
            <InlineSkeleton height={210} />
            <InlineSkeleton width="62%" height={26} />
            <InlineSkeleton width="82%" height={14} />
          </View>
        ) : latestRide ? (
          <JournalHero ride={latestRide} onPress={() => navigation.navigate("RideDetail", { rideId: latestRide.id })} />
        ) : (
          <PremiumEmptyState
            icon="map-outline"
            title="Your first route starts here"
            body="Record a ride and RidePulse will turn the GPS trace into a cinematic journal entry."
            actionLabel="Start a ride"
            onAction={() => navigation.navigate("Ride")}
          />
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>This month</Text>
              <Text style={[styles.sectionMeta, { color: colors.muted }]}>{monthChange == null ? "A fresh chapter" : `${monthChange >= 0 ? "+" : ""}${monthChange}% vs last month`}</Text>
            </View>
            {journal?.monthlyRecap?.bestRide ? <Text style={[styles.bestLabel, { color: colors.blue }]}>BEST: {km(journal.monthlyRecap.bestRide.distanceM)}</Text> : null}
          </View>
          <View style={[styles.metrics, { backgroundColor: colors.surface }]}>
            <Metric label="DISTANCE" value={km(journal?.monthlyRecap?.distanceM || journal?.stats?.monthDistanceM || 0)} accent />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Metric label="RIDES" value={String(journal?.monthlyRecap?.rideCount || 0)} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Metric label="BEST SPEED" value={`${Math.round(journal?.stats?.bestTopSpeedKmh || 0)} km/h`} />
          </View>
        </View>

        {memories.length ? (
          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Memories</Text>
              <Text style={[styles.sectionMeta, { color: colors.muted }]}>Albums & routes</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memoryRail}>
              {memories.map((memory) => (
                <MemoryCard key={memory.id} memory={memory} onPress={() => openMemory(memory)} />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {highlights.length ? (
          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Worth remembering</Text>
              <Text style={[styles.sectionMeta, { color: colors.muted }]}>Smart picks</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.highlightRail}>
              {highlights.map((highlight) => (
                <SmartHighlight
                  key={highlight.id}
                  highlight={highlight}
                  onPress={highlight.rideId ? () => navigation.navigate("RideDetail", { rideId: highlight.rideId }) : undefined}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {journal?.recentRides?.length ? (
          <View style={styles.section}>
            <View style={styles.sectionHeading}><Text style={[styles.sectionTitle, { color: colors.text }]}>Recent journeys</Text><Pressable onPress={() => navigation.navigate("History")}><Text style={[styles.seeAll, { color: colors.accent }]}>See journal</Text></Pressable></View>
            {journal.recentRides.filter((ride) => ride.id !== latestRide?.id).slice(0, 4).map((ride) => <JournalCard key={ride.id} ride={ride} onPress={() => navigation.navigate("RideDetail", { rideId: ride.id })} />)}
          </View>
        ) : null}
      </ScrollView>
      {selectedMemory?.ride ? (
        <RideSlideshowModal
          visible={Boolean(selectedMemory)}
          ride={selectedMemory.ride}
          photos={selectedMemoryPhotos}
          onClose={() => {
            setSelectedMemory(null);
            setSelectedMemoryPhotos([]);
          }}
        />
      ) : null}
    </Screen>
  );
}

async function loadJournalWithFallback(): Promise<JournalResponse> {
  try {
    return normalizeJournal(await api<JournalResponse>("/journal"));
  } catch (journalError) {
    const dashboard = await api<{ stats: DashboardStats; recentRides: Ride[] }>("/dashboard");
    return fallbackJournal(dashboard.stats, dashboard.recentRides);
  }
}

function fallbackJournal(stats: DashboardStats, recentRides: Ride[]): JournalResponse {
  const normalizedStats = normalizeStats(stats);
  const rides = Array.isArray(recentRides) ? recentRides : [];
  const latestRide = rides[0] || null;
  const highlights: JournalHighlight[] = latestRide ? [{
    id: "latest",
    type: "ride",
    title: "Latest escape",
    body: latestRide.highlightReason || "Your newest route is ready to revisit.",
    rideId: latestRide.id,
    icon: "sparkles"
  }] : [];
  return {
    generatedAt: new Date().toISOString(),
    stats: normalizedStats,
    latestRide,
    monthlyRecap: {
      distanceM: normalizedStats.monthDistanceM,
      previousMonthDistanceM: normalizedStats.previousMonthDistanceM || 0,
      distanceDeltaPercent: normalizedStats.previousMonthDistanceM ? Math.round(((normalizedStats.monthDistanceM - normalizedStats.previousMonthDistanceM) / normalizedStats.previousMonthDistanceM) * 100) : null,
      rideCount: rides.filter((ride) => isThisMonth(ride.startedAt)).length,
      bestRide: rides.reduce<Ride | null>((best, ride) => !best || ride.distanceM > best.distanceM ? ride : best, null)
    },
    highlights,
    recentRides: rides,
    unreviewedCount: normalizedStats.unreviewedRides || 0
  };
}

function normalizeJournal(response: any): JournalResponse {
  const stats = normalizeStats(response?.stats);
  return {
    generatedAt: typeof response?.generatedAt === "string" ? response.generatedAt : new Date().toISOString(),
    stats,
    latestRide: response?.latestRide || null,
    monthlyRecap: {
      distanceM: number(response?.monthlyRecap?.distanceM),
      previousMonthDistanceM: number(response?.monthlyRecap?.previousMonthDistanceM),
      distanceDeltaPercent: response?.monthlyRecap?.distanceDeltaPercent == null ? null : number(response.monthlyRecap.distanceDeltaPercent),
      rideCount: number(response?.monthlyRecap?.rideCount),
      bestRide: response?.monthlyRecap?.bestRide || null
    },
    highlights: Array.isArray(response?.highlights) ? response.highlights : [],
    recentRides: Array.isArray(response?.recentRides) ? response.recentRides : [],
    unreviewedCount: number(response?.unreviewedCount)
  };
}

function normalizeStats(stats: any): DashboardStats {
  return {
    todayDistanceM: number(stats?.todayDistanceM),
    monthDistanceM: number(stats?.monthDistanceM),
    yearDistanceM: number(stats?.yearDistanceM),
    totalRides: number(stats?.totalRides),
    unreviewedRides: number(stats?.unreviewedRides),
    bestTopSpeedKmh: number(stats?.bestTopSpeedKmh),
    averageSpeedKmh: number(stats?.averageSpeedKmh),
    previousMonthDistanceM: number(stats?.previousMonthDistanceM),
    longestRideDistanceM: number(stats?.longestRideDistanceM)
  };
}

function isThisMonth(value?: string) {
  const date = value ? new Date(value) : null;
  const now = new Date();
  return Boolean(date && Number.isFinite(date.getTime()) && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth());
}

function number(value: unknown) {
  const safe = Number(value);
  return Number.isFinite(safe) ? safe : 0;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 118, gap: 26 },
  header: { flexDirection: "row", alignItems: "center", gap: 16, paddingTop: 2 },
  headerText: { flex: 1 },
  flex: { flex: 1 },
  eyebrow: { fontFamily: typography.bold, fontSize: 10, letterSpacing: 1.4 },
  title: { fontFamily: typography.extraBold, fontSize: 34, lineHeight: 40, letterSpacing: -0.8, marginTop: 3 },
  subtitle: { fontFamily: typography.medium, fontSize: 13, lineHeight: 19, marginTop: 4 },
  avatar: { width: 52, height: 52, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  startRide: { minHeight: 88, borderRadius: 28, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  startIcon: { width: 44, height: 44, borderRadius: 15, borderWidth: 1, borderColor: "rgba(0,0,0,0.16)", alignItems: "center", justifyContent: "center" },
  startKicker: { fontFamily: typography.bold, fontSize: 9, letterSpacing: 1.2, opacity: 0.68 },
  startTitle: { fontFamily: typography.extraBold, fontSize: 19, marginTop: 2 },
  section: { gap: 14 },
  sectionHeading: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  sectionTitle: { fontFamily: typography.extraBold, fontSize: 22, letterSpacing: -0.3 },
  sectionMeta: { fontFamily: typography.medium, fontSize: 11 },
  bestLabel: { fontFamily: typography.bold, fontSize: 10, letterSpacing: 1 },
  seeAll: { fontFamily: typography.bold, fontSize: 12 },
  metrics: { flexDirection: "row", alignItems: "center", padding: 17, borderRadius: 26, gap: 12 },
  divider: { width: 1, height: 42 },
  highlightRail: { gap: 12, paddingRight: 20 },
  memoryRail: { gap: 14, paddingRight: 20 },
  banner: { flexDirection: "row", gap: 12, padding: 15, borderRadius: 20 },
  bannerTitle: { fontFamily: typography.bold, fontSize: 13 },
  bannerCopy: { fontFamily: typography.regular, fontSize: 11, marginTop: 2 },
  skeletonCard: { borderRadius: 30, padding: 16, gap: 14 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.992 }] }
});
