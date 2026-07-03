import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Animated, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../api/client";
import { JournalCard } from "../components/JournalCard";
import { PremiumEmptyState } from "../components/PremiumEmptyState";
import { Screen } from "../components/Screen";
import { typography } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { Ride } from "../types";

type Filter = "all" | "month" | "longest" | "fastest" | "unreviewed";

const filters: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "month", label: "This month" },
  { key: "longest", label: "Longest" },
  { key: "fastest", label: "Fastest" },
  { key: "unreviewed", label: "Unreviewed" }
];
const JOURNAL_FILTER_KEY = "duke_ride_journal_filter_v1";

export function HistoryScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const [filter, setFilter] = useState<Filter>("all");
  const [rides, setRides] = useState<Ride[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reduceMotion, setReduceMotion] = useState(false);
  const fade = useRef(new Animated.Value(1)).current;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setError("");
      const period = filter === "month" ? "month" : "all";
      const query = searchQuery.trim();
      const response = await api<{ rides: Ride[] }>(`/rides?period=${period}${query ? `&q=${encodeURIComponent(query)}` : ""}`);
      setRides(Array.isArray(response.rides) ? response.rides : []);
    } catch (err: any) {
      setError(err.message || "Your journal is unavailable");
    } finally {
      setLoading(false);
    }
  }, [filter, searchQuery]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(JOURNAL_FILTER_KEY)
      .then((stored) => {
        if (mounted && filters.some((item) => item.key === stored)) {
          setFilter(stored as Filter);
        }
      })
      .catch(() => {});
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    fade.setValue(0.72);
    Animated.timing(fade, {
      toValue: 1,
      duration: reduceMotion ? 0 : 180,
      useNativeDriver: true
    }).start();
  }, [fade, filter, reduceMotion, rides.length]);

  function chooseFilter(nextFilter: Filter) {
    setFilter(nextFilter);
    AsyncStorage.setItem(JOURNAL_FILTER_KEY, nextFilter).catch(() => {});
  }

  const displayedRides = useMemo(() => {
    const next = [...rides];
    if (filter === "unreviewed") {
      return next.filter((ride) => !ride.reviewedAt);
    }
    if (filter === "longest") {
      return next.sort((a, b) => Number(b.distanceM || 0) - Number(a.distanceM || 0));
    }
    if (filter === "fastest") {
      return next.sort((a, b) => Number(b.topSpeedKmh || 0) - Number(a.topSpeedKmh || 0));
    }
    return next;
  }, [filter, rides]);

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />}>
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>EVERY ROAD, REMEMBERED</Text>
          <Text style={[styles.title, { color: colors.text }]}>Journal</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Editorial cards, smart labels, and the routes that made the month.</Text>
        </View>
        <View style={styles.headerActions}>
          <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="search" color={colors.muted} size={18} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search title, notes, places"
              placeholderTextColor={colors.muted}
              returnKeyType="search"
              autoCapitalize="none"
              style={[styles.searchInput, { color: colors.text }]}
            />
            {searchQuery ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Clear ride search" onPress={() => setSearchQuery("")}>
                <Ionicons name="close-circle" color={colors.muted} size={18} />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate("Trips")}
            style={({ pressed }) => [styles.tripsButton, { backgroundColor: colors.accent }, pressed && styles.pressed]}
          >
            <Ionicons name="albums" color={colors.onAccent} size={18} />
            <Text style={[styles.tripsButtonText, { color: colors.onAccent }]}>Trips</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {filters.map((item) => {
            const selected = filter === item.key;
            return (
              <Pressable key={item.key} onPress={() => chooseFilter(item.key)} style={[styles.filter, { backgroundColor: selected ? colors.text : colors.surface }]}>
                <Text style={[styles.filterText, { color: selected ? colors.background : colors.muted }]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {error ? <Pressable onPress={load} style={[styles.error, { backgroundColor: `${colors.danger}16` }]}><Ionicons name="cloud-offline" color={colors.danger} size={21} /><View style={styles.flex}><Text style={[styles.errorTitle, { color: colors.text }]}>Couldn’t open the journal</Text><Text style={[styles.errorCopy, { color: colors.muted }]}>{error} · Tap to retry</Text></View></Pressable> : null}
        <Animated.View style={[styles.list, { opacity: fade }]}>
          {displayedRides.map((ride, index) => <JournalCard key={ride.id} featured={index === 0 && filter !== "unreviewed"} ride={ride} onPress={() => navigation.navigate("RideDetail", { rideId: ride.id, reviewMode: !ride.reviewedAt })} />)}
        </Animated.View>
        {loading && !displayedRides.length ? <View style={styles.loading}><ActivityIndicator color={colors.accent} /><Text style={[styles.loadingText, { color: colors.muted }]}>Finding your roads</Text></View> : null}
        {!loading && !error && !displayedRides.length ? (
          <PremiumEmptyState
            title={filter === "unreviewed" ? "Everything is reviewed" : "No journeys in this chapter"}
            body={searchQuery.trim() ? "Try another search, or clear it to return to all rides." : filter === "unreviewed" ? "Nice. Your ride stories are caught up." : "Choose another filter, or record your next ride to begin one."}
            actionLabel="Start a ride"
            onAction={() => navigation.navigate("Ride")}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 118, gap: 18 },
  header: { gap: 5, paddingTop: 2 },
  eyebrow: { fontFamily: typography.bold, fontSize: 10, letterSpacing: 1.35 },
  title: { fontFamily: typography.extraBold, fontSize: 38, lineHeight: 44, letterSpacing: -0.8 },
  subtitle: { fontFamily: typography.regular, fontSize: 14, lineHeight: 21, maxWidth: 350 },
  headerActions: { gap: 10 },
  searchBox: { minHeight: 46, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 9 },
  searchInput: { flex: 1, minWidth: 0, fontFamily: typography.medium, fontSize: 13, paddingVertical: 0 },
  tripsButton: { alignSelf: "flex-start", minHeight: 42, borderRadius: 15, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 7 },
  tripsButtonText: { fontFamily: typography.bold, fontSize: 12 },
  filters: { gap: 8, paddingRight: 20 },
  filter: { minHeight: 42, borderRadius: 999, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  filterText: { fontFamily: typography.bold, fontSize: 11 },
  list: { gap: 16 },
  error: { flexDirection: "row", gap: 12, padding: 15, borderRadius: 20 },
  flex: { flex: 1 },
  errorTitle: { fontFamily: typography.bold, fontSize: 13 },
  errorCopy: { fontFamily: typography.regular, fontSize: 11, marginTop: 2 },
  loading: { height: 220, alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { fontFamily: typography.medium },
  pressed: { opacity: 0.88, transform: [{ scale: 0.992 }] }
});
