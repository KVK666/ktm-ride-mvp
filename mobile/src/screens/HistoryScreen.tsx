import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../api/client";
import { JournalCard } from "../components/JournalCard";
import { MemoryCard } from "../components/MemoryCard";
import { PremiumEmptyState } from "../components/PremiumEmptyState";
import { Screen } from "../components/Screen";
import { useAuth } from "../context/AuthContext";
import { buildRideMemories } from "../services/rideAlbums";
import { typography } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { Ride, RideMemory } from "../types";
import { buildRideListQuery, mergeRidePages } from "../utils/journalQuery";

type Filter = "all" | "month" | "review" | "cleanup";
type Sort = "newest" | "longest" | "fastest";
type JournalView = "rides" | "trips" | "memories";
const filters: { key: Filter; label: string }[] = [{ key: "all", label: "All" }, { key: "month", label: "This month" }, { key: "review", label: "Needs review" }, { key: "cleanup", label: "Cleanup" }];
const sorts: { key: Sort; label: string }[] = [{ key: "newest", label: "Newest" }, { key: "longest", label: "Longest" }, { key: "fastest", label: "Fastest" }];

export function HistoryScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const { user } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [view, setView] = useState<JournalView>("rides");
  const [rides, setRides] = useState<Ride[]>([]);
  const [memories, setMemories] = useState<RideMemory[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const requestGeneration = useRef(0);
  const loadMoreInFlight = useRef(false);
  const preferenceKey = `duke_ride_journal_state_v2:${user?.id || "rider"}`;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    AsyncStorage.getItem(preferenceKey).then((stored) => {
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (filters.some((item) => item.key === parsed.filter)) setFilter(parsed.filter);
      if (sorts.some((item) => item.key === parsed.sort)) setSort(parsed.sort);
      if (parsed.view === "rides" || parsed.view === "memories") {
        setView(parsed.view);
      } else if (parsed.view === "trips") {
        navigation.navigate("Trips");
      }
    }).catch(() => {});
  }, [navigation, preferenceKey]);

  useEffect(() => { AsyncStorage.setItem(preferenceKey, JSON.stringify({ filter, sort, view })).catch(() => {}); }, [filter, preferenceKey, sort, view]);

  const load = useCallback(async () => {
    const generation = ++requestGeneration.current;
    loadMoreInFlight.current = false;
    setLoading(true);
    setLoadingMore(false);
    setError("");
    try {
      const params = buildRideListQuery({ filter, sort, query: debouncedQuery });
      const response = await api<{ rides: Ride[]; pageInfo?: { hasMore?: boolean; nextCursor?: string | null } }>(`/rides?${params}`);
      const next = Array.isArray(response.rides) ? response.rides : [];
      const nextMemories = await buildRideMemories(next);
      if (generation !== requestGeneration.current) return;
      setRides(next);
      setHasMore(Boolean(response.pageInfo?.hasMore));
      setNextCursor(response.pageInfo?.nextCursor || null);
      setMemories(nextMemories);
    } catch (err: any) {
      if (generation === requestGeneration.current) {
        setError(err.message || "Your journal is unavailable");
      }
    } finally {
      if (generation === requestGeneration.current) {
        setLoading(false);
      }
    }
  }, [debouncedQuery, filter, sort]);

  const loadMore = useCallback(async () => {
    if (loading || loadMoreInFlight.current || !hasMore || !nextCursor || view !== "rides") return;
    const generation = requestGeneration.current;
    loadMoreInFlight.current = true;
    setLoadingMore(true);
    try {
      const params = buildRideListQuery({ filter, sort, query: debouncedQuery, cursor: nextCursor });
      const response = await api<{ rides: Ride[]; pageInfo?: { hasMore?: boolean; nextCursor?: string | null } }>(`/rides?${params}`);
      if (generation !== requestGeneration.current) return;
      const incoming = Array.isArray(response.rides) ? response.rides : [];
      const combined = mergeRidePages(rides, incoming);
      const combinedMemories = await buildRideMemories(combined);
      if (generation !== requestGeneration.current) return;
      setRides(combined);
      setHasMore(Boolean(response.pageInfo?.hasMore));
      setNextCursor(response.pageInfo?.nextCursor || null);
      setMemories(combinedMemories);
    } catch (err: any) {
      if (generation === requestGeneration.current) {
        setError(err.message || "Unable to load older rides");
      }
    } finally {
      if (generation === requestGeneration.current) {
        loadMoreInFlight.current = false;
        setLoadingMore(false);
      }
    }
  }, [debouncedQuery, filter, hasMore, loading, nextCursor, rides, sort, view]);

  useFocusEffect(useCallback(() => {
    load();
    return () => {
      requestGeneration.current += 1;
      loadMoreInFlight.current = false;
    };
  }, [load]));

  const displayed = useMemo(() => {
    let next = [...rides];
    if (filter === "review") next = next.filter((ride) => !ride.reviewedAt);
    if (filter === "cleanup") next = next.filter((ride) => ride.cleanupCandidate);
    if (sort === "longest") next.sort((a, b) => Number(b.distanceM || 0) - Number(a.distanceM || 0));
    if (sort === "fastest") next.sort((a, b) => Number(b.topSpeedKmh || 0) - Number(a.topSpeedKmh || 0));
    return next;
  }, [filter, rides, sort]);

  function chooseView(next: JournalView) {
    if (next === "trips") {
      AsyncStorage.setItem(preferenceKey, JSON.stringify({ filter, sort, view: "trips" })).catch(() => {});
      navigation.navigate("Trips");
      return;
    }
    setView(next);
  }

  const header = (
    <View style={styles.headerContent}>
      <View style={styles.header}><Text style={[styles.eyebrow, { color: colors.accent }]}>YOUR RIDING HISTORY</Text><Text style={[styles.title, { color: colors.text }]}>Journal</Text><Text style={[styles.subtitle, { color: colors.muted }]}>Find a ride, group a trip, or revisit a memory.</Text></View>
      <View style={[styles.viewTabs, { backgroundColor: colors.surface }]}>
        {(["rides", "trips", "memories"] as JournalView[]).map((item) => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: view === item }} onPress={() => chooseView(item)} style={[styles.viewTab, view === item && { backgroundColor: colors.accent }]}><Ionicons name={item === "rides" ? "bicycle" : item === "trips" ? "albums" : "images"} color={view === item ? colors.onAccent : colors.muted} size={17} /><Text style={[styles.viewTabText, { color: view === item ? colors.onAccent : colors.muted }]}>{item[0].toUpperCase() + item.slice(1)}</Text></Pressable>)}
      </View>
      {view === "rides" ? <>
        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="search" color={colors.muted} size={18} /><TextInput accessibilityLabel="Search rides" value={query} onChangeText={setQuery} placeholder="Search rides, places, AI insights" placeholderTextColor={colors.muted} style={[styles.searchInput, { color: colors.text }]} />{query ? <Pressable accessibilityLabel="Clear search" onPress={() => setQuery("")}><Ionicons name="close-circle" color={colors.muted} size={19} /></Pressable> : null}</View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{filters.map((item) => <Chip key={item.key} label={item.label} selected={filter === item.key} onPress={() => setFilter(item.key)} />)}</ScrollView>
        <View style={styles.sortRow}><Text style={[styles.sortLabel, { color: colors.muted }]}>Sort</Text>{sorts.map((item) => <Chip key={item.key} compact label={item.label} selected={sort === item.key} onPress={() => setSort(item.key)} />)}</View>
      </> : null}
      {error ? <Pressable onPress={load} style={[styles.error, { backgroundColor: `${colors.danger}16` }]}><Ionicons name="cloud-offline" color={colors.danger} size={20} /><Text style={[styles.errorCopy, { color: colors.text }]}>{error}. Tap to retry.</Text></Pressable> : null}
    </View>
  );

  if (view === "memories") {
    return <Screen><FlatList data={memories} keyExtractor={(item) => item.id} renderItem={({ item }) => <MemoryCard memory={item} onPress={() => item.rideId && navigation.navigate("RideDetail", { rideId: item.rideId })} />} ListHeaderComponent={header} contentContainerStyle={styles.content} ItemSeparatorComponent={() => <View style={styles.separator} />} ListEmptyComponent={!loading ? <PremiumEmptyState title="No memories yet" body="Add photos or record another route and your memories will appear here." /> : null} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />} /> </Screen>;
  }

  return <Screen><FlatList data={displayed} keyExtractor={(item) => item.id} renderItem={({ item }) => <JournalCard ride={item} onPress={() => navigation.navigate("RideDetail", { rideId: item.id, reviewMode: !item.reviewedAt })} />} ListHeaderComponent={header} contentContainerStyle={styles.content} ItemSeparatorComponent={() => <View style={styles.separator} />} ListEmptyComponent={loading ? <View style={styles.loading}><ActivityIndicator color={colors.accent} /></View> : !error ? <PremiumEmptyState title="No rides found" body={query ? "Try another search." : "Record a ride to start your journal."} actionLabel="Start ride" onAction={() => navigation.navigate("Ride")} /> : null} ListFooterComponent={loadingMore ? <View style={styles.footerLoading}><ActivityIndicator color={colors.accent} /></View> : hasMore ? <Pressable accessibilityRole="button" onPress={loadMore} style={[styles.loadMoreButton, { backgroundColor: colors.surface }]}><Text style={[styles.loadMoreText, { color: colors.accent }]}>Load older rides</Text></Pressable> : null} onEndReached={loadMore} onEndReachedThreshold={0.35} refreshControl={<RefreshControl refreshing={loading && rides.length > 0} onRefresh={load} tintColor={colors.accent} />} initialNumToRender={6} windowSize={7} removeClippedSubviews /></Screen>;
}

function Chip({ label, selected, onPress, compact = false }: { label: string; selected: boolean; onPress: () => void; compact?: boolean }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, compact && styles.chipCompact, { backgroundColor: selected ? colors.text : colors.surface }]}><Text style={[styles.chipText, { color: selected ? colors.background : colors.muted }]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 120 }, headerContent: { gap: 16, marginBottom: 16 }, header: { gap: 4, paddingRight: 54 }, eyebrow: { fontFamily: typography.bold, fontSize: 10, letterSpacing: 1.35 }, title: { fontFamily: typography.extraBold, fontSize: 36 }, subtitle: { fontFamily: typography.regular, fontSize: 14, lineHeight: 20 }, viewTabs: { flexDirection: "row", borderRadius: 18, padding: 4 }, viewTab: { flex: 1, minHeight: 44, borderRadius: 14, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" }, viewTabText: { fontFamily: typography.bold, fontSize: 11 }, searchBox: { minHeight: 48, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 9 }, searchInput: { flex: 1, fontFamily: typography.medium, fontSize: 13 }, chips: { gap: 8 }, chip: { minHeight: 44, borderRadius: 999, paddingHorizontal: 15, alignItems: "center", justifyContent: "center" }, chipCompact: { minHeight: 44, paddingHorizontal: 12 }, chipText: { fontFamily: typography.bold, fontSize: 11 }, sortRow: { flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" }, sortLabel: { fontFamily: typography.bold, fontSize: 11, marginRight: 2 }, error: { flexDirection: "row", gap: 10, alignItems: "center", padding: 14, borderRadius: 18 }, errorCopy: { flex: 1, fontFamily: typography.medium, fontSize: 12 }, separator: { height: 14 }, loading: { minHeight: 180, alignItems: "center", justifyContent: "center" }, footerLoading: { minHeight: 64, alignItems: "center", justifyContent: "center" }, loadMoreButton: { minHeight: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 14 }, loadMoreText: { fontFamily: typography.bold, fontSize: 13 }
});
