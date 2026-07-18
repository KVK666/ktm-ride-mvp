import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
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
  const [createOpen, setCreateOpen] = useState(false);
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
      setCreateOpen(false);
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
    <Screen includeTopInset={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />}
      >
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <Text style={[styles.eyebrow, { color: colors.accent }]}>TRIP ALBUMS</Text>
              <Text style={[styles.title, { color: colors.text }]}>Trips</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create new trip"
              onPress={() => { setMessage(""); setCreateOpen(true); }}
              style={({ pressed }) => [styles.newTripButton, { backgroundColor: colors.accent }, pressed && styles.pressed]}
            >
              <Ionicons name="add" color={colors.onAccent} size={20} />
              <Text style={[styles.newTripText, { color: colors.onAccent }]}>New trip</Text>
            </Pressable>
          </View>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Group related rides into a manual album without changing the ride records.</Text>
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
      <Modal visible={createOpen} transparent animationType="slide" onRequestClose={() => setCreateOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close new trip form" style={styles.modalDismiss} onPress={() => setCreateOpen(false)} />
          <View style={[styles.createSheet, { backgroundColor: colors.surface }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={styles.headerCopy}>
                <Text style={[styles.eyebrow, { color: colors.accent }]}>NEW TRIP</Text>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Create a trip album</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setCreateOpen(false)} style={[styles.closeButton, { backgroundColor: colors.surfaceHigh }]}>
                <Ionicons name="close" color={colors.text} size={22} />
              </Pressable>
            </View>
            <TextInput
              autoFocus
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
        </View>
      </Modal>
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
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headerCopy: { flex: 1, minWidth: 0, gap: 4 },
  eyebrow: { fontFamily: typography.bold, fontSize: 10, letterSpacing: 1.35 },
  title: { fontFamily: typography.extraBold, fontSize: 38, lineHeight: 44 },
  subtitle: { fontFamily: typography.regular, fontSize: 14, lineHeight: 21, maxWidth: 360 },
  cardTitle: { fontFamily: typography.bold, fontSize: 16 },
  newTripButton: { minHeight: 44, borderRadius: 15, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 6 },
  newTripText: { fontFamily: typography.bold, fontSize: 13 },
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
  emptyText: { fontFamily: typography.regular, fontSize: 13, lineHeight: 19 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.58)" },
  modalDismiss: { ...StyleSheet.absoluteFillObject },
  createSheet: { borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 34, gap: 13 },
  sheetHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: "rgba(150,150,150,0.55)", alignSelf: "center", marginBottom: 4 },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  closeButton: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" }
});
