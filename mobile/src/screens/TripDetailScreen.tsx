import { Ionicons } from "@expo/vector-icons";
import { RouteProp, useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../api/client";
import { JournalCard } from "../components/JournalCard";
import { Screen } from "../components/Screen";
import { typography } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { Ride, Trip } from "../types";
import { km, shortDate } from "../utils/format";

type TripDetailParams = {
  TripDetail: {
    tripId: string;
  };
};

export function TripDetailScreen() {
  const route = useRoute<RouteProp<TripDetailParams, "TripDetail">>();
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [removingRideId, setRemovingRideId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api<{ trip: Trip; rides: Ride[] }>(`/trips/${route.params.tripId}`);
      setTrip(response.trip || null);
      setRides(Array.isArray(response.rides) ? response.rides : []);
    } catch (err: any) {
      setTrip(null);
      setRides([]);
      setError(err.message || "Trip unavailable");
    } finally {
      setLoading(false);
    }
  }, [route.params.tripId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function confirmRemoveRide(ride: Ride) {
    Alert.alert(
      "Remove ride from trip?",
      `${ride.title || ride.startLabel}\n\nThe ride stays in your journal.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => removeRide(ride.id) }
      ]
    );
  }

  async function removeRide(rideId: string) {
    setRemovingRideId(rideId);
    try {
      const response = await api<{ trip: Trip; rides: Ride[] }>(`/trips/${route.params.tripId}/rides/${rideId}`, { method: "DELETE" });
      setTrip(response.trip || trip);
      setRides(Array.isArray(response.rides) ? response.rides : rides.filter((ride) => ride.id !== rideId));
    } catch (err: any) {
      setError(err.message || "Unable to remove ride");
    } finally {
      setRemovingRideId(null);
    }
  }

  function confirmDeleteTrip() {
    if (!trip || deleting) return;
    Alert.alert(
      "Delete trip album?",
      `${trip.title}\n\nThis only deletes the trip album. Rides and photos stay in your journal.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: deleteTrip }
      ]
    );
  }

  async function deleteTrip() {
    setDeleting(true);
    try {
      await api(`/trips/${route.params.tripId}`, { method: "DELETE" });
      navigation.goBack();
    } catch (err: any) {
      setError(err.message || "Unable to delete trip");
    } finally {
      setDeleting(false);
    }
  }

  if (loading && !trip) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />}
      >
        {trip ? (
          <>
            <View style={styles.header}>
              <Text style={[styles.eyebrow, { color: colors.accent }]}>TRIP ALBUM</Text>
              <Text style={[styles.title, { color: colors.text }]}>{trip.title}</Text>
              {trip.description ? <Text style={[styles.subtitle, { color: colors.muted }]}>{trip.description}</Text> : null}
            </View>

            <View style={[styles.stats, { backgroundColor: colors.surface }]}>
              <Stat label="Rides" value={String(trip.rideCount || rides.length)} />
              <Stat label="Distance" value={km(trip.distanceM)} />
              <Stat label="First ride" value={trip.startedAt ? shortDate(trip.startedAt) : "--"} />
            </View>

            <View style={styles.actions}>
              <Pressable onPress={() => navigation.navigate("MainTabs", { screen: "History" })} style={[styles.actionButton, { backgroundColor: colors.accent }]}>
                <Ionicons name="add-circle" color={colors.onAccent} size={18} />
                <Text style={[styles.actionText, { color: colors.onAccent }]}>Add from ride detail</Text>
              </Pressable>
              <Pressable disabled={deleting} onPress={confirmDeleteTrip} style={[styles.actionButton, styles.deleteButton, { backgroundColor: `${colors.danger}20` }]}>
                <Ionicons name="trash" color={colors.danger} size={18} />
                <Text style={[styles.actionText, { color: colors.danger }]}>{deleting ? "Deleting..." : "Delete trip"}</Text>
              </Pressable>
            </View>
          </>
        ) : null}

        {error ? (
          <Pressable onPress={load} style={[styles.notice, { backgroundColor: `${colors.danger}16` }]}>
            <Ionicons name="cloud-offline" color={colors.danger} size={21} />
            <Text style={[styles.noticeText, { color: colors.text }]}>{error}. Tap to retry.</Text>
          </Pressable>
        ) : null}

        <View style={styles.rideList}>
          {rides.map((ride) => (
            <View key={ride.id} style={styles.rideWrap}>
              <JournalCard ride={ride} onPress={() => navigation.navigate("RideDetail", { rideId: ride.id, reviewMode: !ride.reviewedAt })} />
              <Pressable
                accessibilityRole="button"
                disabled={removingRideId === ride.id}
                onPress={() => confirmRemoveRide(ride)}
                style={({ pressed }) => [styles.removeButton, { backgroundColor: colors.surfaceHigh }, pressed && styles.pressed]}
              >
                <Ionicons name="remove-circle" color={colors.danger} size={17} />
                <Text style={[styles.removeText, { color: colors.text }]}>{removingRideId === ride.id ? "Removing..." : "Remove from trip"}</Text>
              </Pressable>
            </View>
          ))}
        </View>

        {!loading && trip && !rides.length ? (
          <View style={[styles.empty, { backgroundColor: colors.surface }]}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No rides in this trip yet</Text>
            <Text style={[styles.emptyText, { color: colors.muted }]}>Open any ride detail and use Add to trip.</Text>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  content: { padding: 20, paddingBottom: 118, gap: 18 },
  header: { gap: 6 },
  eyebrow: { fontFamily: typography.bold, fontSize: 10, letterSpacing: 1.35 },
  title: { fontFamily: typography.extraBold, fontSize: 34, lineHeight: 40 },
  subtitle: { fontFamily: typography.regular, fontSize: 14, lineHeight: 21 },
  stats: { borderRadius: 22, padding: 14, flexDirection: "row", gap: 10 },
  stat: { flex: 1, minWidth: 0 },
  statLabel: { fontFamily: typography.bold, fontSize: 10, letterSpacing: 0.8 },
  statValue: { fontFamily: typography.extraBold, fontSize: 16, marginTop: 4 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  actionButton: { minHeight: 44, borderRadius: 15, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 7 },
  deleteButton: { borderWidth: 1, borderColor: "rgba(255, 98, 107, 0.2)" },
  actionText: { fontFamily: typography.bold, fontSize: 12 },
  notice: { minHeight: 58, borderRadius: 18, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  noticeText: { flex: 1, fontFamily: typography.medium, fontSize: 12 },
  rideList: { gap: 16 },
  rideWrap: { gap: 8 },
  removeButton: { alignSelf: "flex-start", minHeight: 38, borderRadius: 14, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 7 },
  removeText: { fontFamily: typography.bold, fontSize: 12 },
  pressed: { opacity: 0.88, transform: [{ scale: 0.992 }] },
  empty: { borderRadius: 22, padding: 18, gap: 6 },
  emptyTitle: { fontFamily: typography.bold, fontSize: 16 },
  emptyText: { fontFamily: typography.regular, fontSize: 13, lineHeight: 19 }
});
