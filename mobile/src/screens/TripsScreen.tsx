import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../api/client";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { typography } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { Trip } from "../types";
import { km, shortDate } from "../utils/format";

export function TripsScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const sortedTrips = useMemo(
    () => [...trips].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))),
    [trips]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api<{ trips: Trip[] }>("/trips");
      setTrips(Array.isArray(response.trips) ? response.trips.map(normalizeTrip) : []);
    } catch (err: any) {
      setError(err.message || "Trip albums are unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function createTrip() {
    const cleanTitle = title.trim();
    if (!cleanTitle || saving) {
      setMessage("Name the trip album first.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const response = await api<{ trip: Trip }>("/trips", {
        method: "POST",
        body: JSON.stringify({ title: cleanTitle, description: description.trim() || null })
      });
      setTitle("");
      setDescription("");
      await load();
      if (response.trip?.id) {
        navigation.navigate("TripDetail", { tripId: response.trip.id });
      }
    } catch (err: any) {
      setMessage(err.message || "Unable to create trip");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />}
      >
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>TRIP ALBUMS</Text>
          <Text style={[styles.title, { color: colors.text }]}>Trips</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Group related rides into a manual album without changing the ride records.</Text>
        </View>

        <View style={[styles.createCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>New trip album</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Coastal weekend, monsoon loop..."
            placeholderTextColor={colors.muted}
            maxLength={120}
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surfaceHigh }]}
          />
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Optional notes"
            placeholderTextColor={colors.muted}
            maxLength={1000}
            style={[styles.input, styles.descriptionInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surfaceHigh }]}
            multiline
            textAlignVertical="top"
          />
          <PrimaryButton label="Create trip" icon="folder-open" loading={saving} onPress={createTrip} />
          {message ? <Text style={[styles.message, { color: message.includes("Unable") ? colors.danger : colors.muted }]}>{message}</Text> : null}
        </View>

        {error ? (
          <Pressable onPress={load} style={[styles.notice, { backgroundColor: `${colors.danger}16` }]}>
            <Ionicons name="cloud-offline" color={colors.danger} size={21} />
            <Text style={[styles.noticeText, { color: colors.text }]}>{error}. Tap to retry.</Text>
          </Pressable>
        ) : null}

        {loading && !sortedTrips.length ? (
          <View style={styles.loading}><ActivityIndicator color={colors.accent} /></View>
        ) : null}

        <View style={styles.list}>
          {sortedTrips.map((trip) => (
            <Pressable
              key={trip.id}
              accessibilityRole="button"
              onPress={() => navigation.navigate("TripDetail", { tripId: trip.id })}
              style={({ pressed }) => [styles.tripCard, { backgroundColor: colors.surface }, pressed && styles.pressed]}
            >
              <View style={[styles.tripIcon, { backgroundColor: `${colors.accent}18` }]}>
                <Ionicons name="albums" color={colors.accent} size={22} />
              </View>
              <View style={styles.tripBody}>
                <Text numberOfLines={2} style={[styles.tripTitle, { color: colors.text }]}>{trip.title}</Text>
                <Text numberOfLines={2} style={[styles.tripMeta, { color: colors.muted }]}>
                  {trip.rideCount} rides - {km(trip.distanceM)}{trip.startedAt ? ` - since ${shortDate(trip.startedAt)}` : ""}
                </Text>
                {trip.description ? <Text numberOfLines={2} style={[styles.tripDescription, { color: colors.textSoft }]}>{trip.description}</Text> : null}
              </View>
              <Ionicons name="arrow-forward" color={colors.muted} size={20} />
            </Pressable>
          ))}
        </View>

        {!loading && !error && !sortedTrips.length ? (
          <View style={[styles.empty, { backgroundColor: colors.surface }]}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No trip albums yet</Text>
            <Text style={[styles.emptyText, { color: colors.muted }]}>Create one here, then add rides from any Ride Detail screen.</Text>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function normalizeTrip(value: any): Trip {
  return {
    id: String(value?.id || ""),
    title: String(value?.title || "Untitled trip"),
    description: typeof value?.description === "string" ? value.description : null,
    coverRideId: typeof value?.coverRideId === "string" ? value.coverRideId : null,
    rideCount: Number.isFinite(Number(value?.rideCount)) ? Number(value.rideCount) : 0,
    distanceM: Number.isFinite(Number(value?.distanceM)) ? Number(value.distanceM) : 0,
    startedAt: typeof value?.startedAt === "string" ? value.startedAt : null,
    endedAt: typeof value?.endedAt === "string" ? value.endedAt : null,
    createdAt: typeof value?.createdAt === "string" ? value.createdAt : "",
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : ""
  };
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 118, gap: 18 },
  header: { gap: 5 },
  eyebrow: { fontFamily: typography.bold, fontSize: 10, letterSpacing: 1.35 },
  title: { fontFamily: typography.extraBold, fontSize: 38, lineHeight: 44 },
  subtitle: { fontFamily: typography.regular, fontSize: 14, lineHeight: 21, maxWidth: 360 },
  createCard: { borderRadius: 24, padding: 16, gap: 12 },
  cardTitle: { fontFamily: typography.bold, fontSize: 16 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 15, paddingHorizontal: 13, fontFamily: typography.medium, fontSize: 13 },
  descriptionInput: { minHeight: 82, paddingTop: 12 },
  message: { fontFamily: typography.medium, fontSize: 12 },
  notice: { minHeight: 58, borderRadius: 18, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  noticeText: { flex: 1, fontFamily: typography.medium, fontSize: 12 },
  loading: { height: 120, alignItems: "center", justifyContent: "center" },
  list: { gap: 12 },
  tripCard: { borderRadius: 22, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  tripIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  tripBody: { flex: 1, minWidth: 0, gap: 4 },
  tripTitle: { fontFamily: typography.bold, fontSize: 16 },
  tripMeta: { fontFamily: typography.medium, fontSize: 12 },
  tripDescription: { fontFamily: typography.regular, fontSize: 12, lineHeight: 18 },
  pressed: { opacity: 0.88, transform: [{ scale: 0.992 }] },
  empty: { borderRadius: 22, padding: 18, gap: 6 },
  emptyTitle: { fontFamily: typography.bold, fontSize: 16 },
  emptyText: { fontFamily: typography.regular, fontSize: 13, lineHeight: 19 }
});
