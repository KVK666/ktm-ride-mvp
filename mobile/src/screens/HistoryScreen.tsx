import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../api/client";
import { JournalCard } from "../components/JournalCard";
import { Screen } from "../components/Screen";
import { typography } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { Ride } from "../types";

type Period = "all" | "month" | "year";

export function HistoryScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const [period, setPeriod] = useState<Period>("all");
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setError("");
      const response = await api<{ rides: Ride[] }>(`/rides?period=${period}`);
      setRides(Array.isArray(response.rides) ? response.rides : []);
    } catch (err: any) {
      setError(err.message || "Your journal is unavailable");
    } finally { setLoading(false); }
  }, [period]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />}>
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>EVERY ROAD, REMEMBERED</Text>
          <Text style={[styles.title, { color: colors.text }]}>Journal</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>A living record of the places your motorcycle has taken you.</Text>
        </View>
        <View style={[styles.filters, { backgroundColor: colors.surface }]}>
          {(["all", "month", "year"] as Period[]).map((item) => (
            <Pressable key={item} onPress={() => setPeriod(item)} style={[styles.filter, period === item && { backgroundColor: colors.text }]}>
              <Text style={[styles.filterText, { color: period === item ? colors.background : colors.muted }]}>{item === "all" ? "All rides" : item === "month" ? "This month" : "This year"}</Text>
            </Pressable>
          ))}
        </View>
        {error ? <Pressable onPress={load} style={[styles.error, { backgroundColor: `${colors.danger}16` }]}><Ionicons name="cloud-offline" color={colors.danger} size={21} /><View style={styles.flex}><Text style={[styles.errorTitle, { color: colors.text }]}>Couldn’t open the journal</Text><Text style={[styles.errorCopy, { color: colors.muted }]}>{error} · Tap to retry</Text></View></Pressable> : null}
        {rides.map((ride) => <JournalCard key={ride.id} ride={ride} onPress={() => navigation.navigate("RideDetail", { rideId: ride.id, reviewMode: !ride.reviewedAt })} />)}
        {loading && !rides.length ? <View style={styles.loading}><ActivityIndicator color={colors.accent} /><Text style={[styles.loadingText, { color: colors.muted }]}>Finding your roads</Text></View> : null}
        {!loading && !error && !rides.length ? <View style={[styles.empty, { backgroundColor: colors.surface }]}><Ionicons name="trail-sign-outline" color={colors.accent} size={32} /><Text style={[styles.emptyTitle, { color: colors.text }]}>No journeys in this chapter</Text><Text style={[styles.emptyCopy, { color: colors.muted }]}>Choose another period, or record your next ride to begin one.</Text><Pressable onPress={() => navigation.navigate("Ride")} style={[styles.emptyAction, { backgroundColor: colors.accent }]}><Text style={[styles.emptyActionText, { color: colors.onAccent }]}>Start a ride</Text></Pressable></View> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 118, gap: 18 }, header: { gap: 5, paddingTop: 2 },
  eyebrow: { fontFamily: typography.bold, fontSize: 10, letterSpacing: 1.35 }, title: { fontFamily: typography.extraBold, fontSize: 36, lineHeight: 42 }, subtitle: { fontFamily: typography.regular, fontSize: 14, lineHeight: 21, maxWidth: 350 },
  filters: { flexDirection: "row", borderRadius: 18, padding: 4, gap: 3 }, filter: { flex: 1, minHeight: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" }, filterText: { fontFamily: typography.bold, fontSize: 11 },
  error: { flexDirection: "row", gap: 12, padding: 15, borderRadius: 20 }, flex: { flex: 1 }, errorTitle: { fontFamily: typography.bold, fontSize: 13 }, errorCopy: { fontFamily: typography.regular, fontSize: 11, marginTop: 2 },
  loading: { height: 220, alignItems: "center", justifyContent: "center", gap: 10 }, loadingText: { fontFamily: typography.medium },
  empty: { borderRadius: 26, padding: 26, gap: 9 }, emptyTitle: { fontFamily: typography.extraBold, fontSize: 20 }, emptyCopy: { fontFamily: typography.regular, lineHeight: 20 }, emptyAction: { alignSelf: "flex-start", marginTop: 8, minHeight: 42, borderRadius: 14, paddingHorizontal: 16, justifyContent: "center" }, emptyActionText: { fontFamily: typography.bold, fontSize: 13 }
});
