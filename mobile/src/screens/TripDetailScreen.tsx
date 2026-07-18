import { Ionicons } from "@expo/vector-icons";
import { RouteProp, useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ApiError, api } from "../api/client";
import { JournalCard } from "../components/JournalCard";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { typography } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { Ride, Trip } from "../types";
import { km, shortDate } from "../utils/format";
import { rideDisplayTitle } from "../utils/rideTitle";

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
  const [editOpen, setEditOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [availableRides, setAvailableRides] = useState<Ride[]>([]);
  const [selectedRideIds, setSelectedRideIds] = useState<string[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [addingRides, setAddingRides] = useState(false);

  const membershipIds = useMemo(() => new Set(rides.map((ride) => ride.id)), [rides]);

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

  function openEdit() {
    if (!trip) return;
    setError("");
    setTitleDraft(trip.title || "");
    setDescriptionDraft(trip.description || "");
    setEditOpen(true);
  }

  async function saveTripDetails() {
    const title = titleDraft.trim();
    if (!title || savingEdit) {
      setError("Trip title is required");
      return;
    }
    setSavingEdit(true);
    setError("");
    try {
      const response = await api<{ trip: Trip; rides: Ride[] }>(`/trips/${route.params.tripId}`, {
        method: "PATCH",
        body: JSON.stringify({ title, description: descriptionDraft.trim() || null })
      });
      setTrip(response.trip || trip);
      if (Array.isArray(response.rides)) setRides(response.rides);
      setEditOpen(false);
    } catch (err: any) {
      setError(err.message || "Unable to update trip");
    } finally {
      setSavingEdit(false);
    }
  }

  async function openRidePicker() {
    setPickerOpen(true);
    setSelectedRideIds([]);
    setPickerLoading(true);
    setError("");
    try {
      const collected: Ride[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 10; page += 1) {
        const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
        const response = await api<{ rides: Ride[]; pageInfo?: { hasMore?: boolean; nextCursor?: string | null } }>(`/rides?limit=100&sort=newest${cursorParam}`);
        if (Array.isArray(response.rides)) collected.push(...response.rides);
        cursor = response.pageInfo?.nextCursor || null;
        if (!response.pageInfo?.hasMore || !cursor) break;
      }
      const unique = new Map(collected.filter((ride) => ride?.id).map((ride) => [ride.id, ride]));
      setAvailableRides([...unique.values()]);
    } catch (err: any) {
      setError(err.message || "Unable to load rides");
    } finally {
      setPickerLoading(false);
    }
  }

  function toggleRideSelection(rideId: string) {
    if (membershipIds.has(rideId) || addingRides) return;
    setSelectedRideIds((current) => current.includes(rideId) ? current.filter((id) => id !== rideId) : [...current, rideId]);
  }

  async function addSelectedRides() {
    if (!selectedRideIds.length || addingRides) return;
    setAddingRides(true);
    setError("");
    try {
      let response: { trip: Trip; rides: Ride[] } | null = null;
      try {
        response = await api<{ trip: Trip; rides: Ride[] }>(`/trips/${route.params.tripId}/rides`, {
          method: "PUT",
          body: JSON.stringify({ rideIds: selectedRideIds })
        });
      } catch (err) {
        if (!(err instanceof ApiError) || (err.status !== 404 && err.status !== 405)) throw err;
        for (const rideId of selectedRideIds) {
          await api(`/trips/${route.params.tripId}/rides`, {
            method: "POST",
            body: JSON.stringify({ rideId })
          });
        }
      }
      if (response) {
        setTrip(response.trip || trip);
        setRides(Array.isArray(response.rides) ? response.rides : rides);
      } else {
        await load();
      }
      setSelectedRideIds([]);
      setPickerOpen(false);
    } catch (err: any) {
      setError(err.message || "Unable to add selected rides");
    } finally {
      setAddingRides(false);
    }
  }

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
      <Screen includeTopInset={false} style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }

  return (
    <Screen includeTopInset={false}>
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
              <Pressable onPress={openRidePicker} style={[styles.actionButton, { backgroundColor: colors.accent }]}>
                <Ionicons name="add-circle" color={colors.onAccent} size={18} />
                <Text style={[styles.actionText, { color: colors.onAccent }]}>Add rides</Text>
              </Pressable>
              <Pressable onPress={openEdit} style={[styles.actionButton, { backgroundColor: colors.surfaceHigh }]}>
                <Ionicons name="create-outline" color={colors.text} size={18} />
                <Text style={[styles.actionText, { color: colors.text }]}>Edit details</Text>
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
            <Text style={[styles.emptyText, { color: colors.muted }]}>Use Add rides to choose one or more journal rides.</Text>
          </View>
        ) : null}

        {trip ? (
          <View style={[styles.dangerArea, { borderColor: `${colors.danger}45` }]}>
            <View style={styles.dangerCopy}>
              <Text style={[styles.dangerTitle, { color: colors.text }]}>Delete trip album</Text>
              <Text style={[styles.emptyText, { color: colors.muted }]}>Rides and their private albums stay in your journal.</Text>
            </View>
            <Pressable disabled={deleting} onPress={confirmDeleteTrip} style={[styles.actionButton, styles.deleteButton, { backgroundColor: `${colors.danger}18` }]}>
              <Ionicons name="trash" color={colors.danger} size={18} />
              <Text style={[styles.actionText, { color: colors.danger }]}>{deleting ? "Deleting..." : "Delete"}</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={editOpen} transparent animationType="slide" onRequestClose={() => setEditOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalDismiss} onPress={() => setEditOpen(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Edit trip details</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setEditOpen(false)} style={[styles.closeButton, { backgroundColor: colors.surfaceHigh }]}>
                <Ionicons name="close" color={colors.text} size={22} />
              </Pressable>
            </View>
            <TextInput value={titleDraft} onChangeText={setTitleDraft} maxLength={120} placeholder="Trip title" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceHigh }]} />
            <TextInput value={descriptionDraft} onChangeText={setDescriptionDraft} maxLength={1000} multiline textAlignVertical="top" placeholder="Optional notes" placeholderTextColor={colors.muted} style={[styles.input, styles.descriptionInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceHigh }]} />
            {error ? <Text style={[styles.emptyText, { color: colors.danger }]}>{error}</Text> : null}
            <PrimaryButton label="Save changes" icon="save" loading={savingEdit} onPress={saveTripDetails} />
          </View>
        </View>
      </Modal>

      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <Screen>
          <View style={styles.pickerContent}>
            <View style={styles.sheetHeader}>
              <View style={styles.dangerCopy}>
                <Text style={[styles.eyebrow, { color: colors.accent }]}>RIDE PICKER</Text>
                <Text style={[styles.pickerTitle, { color: colors.text }]}>Add rides to {trip?.title || "trip"}</Text>
                <Text style={[styles.emptyText, { color: colors.muted }]}>{rides.length} already in trip · {selectedRideIds.length} selected</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close ride picker" onPress={() => setPickerOpen(false)} style={[styles.closeButton, { backgroundColor: colors.surfaceHigh }]}>
                <Ionicons name="close" color={colors.text} size={22} />
              </Pressable>
            </View>
            {pickerLoading ? <View style={styles.pickerLoading}><ActivityIndicator color={colors.accent} /></View> : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.pickerList}>
                {availableRides.map((ride) => {
                  const inTrip = membershipIds.has(ride.id);
                  const selected = selectedRideIds.includes(ride.id);
                  return (
                    <Pressable
                      key={ride.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: inTrip || selected, disabled: inTrip }}
                      disabled={inTrip || addingRides}
                      onPress={() => toggleRideSelection(ride.id)}
                      style={({ pressed }) => [styles.pickerRide, { backgroundColor: colors.surface }, (inTrip || selected) && { borderColor: colors.accent }, pressed && styles.pressed]}
                    >
                      <Ionicons name={inTrip ? "checkmark-circle" : selected ? "checkbox" : "square-outline"} color={inTrip || selected ? colors.accent : colors.muted} size={23} />
                      <View style={styles.dangerCopy}>
                        <Text numberOfLines={1} style={[styles.pickerRideTitle, { color: colors.text }]}>{rideDisplayTitle(ride)}</Text>
                        <Text style={[styles.emptyText, { color: colors.muted }]}>{shortDate(ride.startedAt)} · {km(ride.distanceM)}{inTrip ? " · In trip" : ""}</Text>
                      </View>
                    </Pressable>
                  );
                })}
                {!availableRides.length ? <Text style={[styles.emptyText, { color: colors.muted }]}>No rides are available yet.</Text> : null}
              </ScrollView>
            )}
            {error ? <Text style={[styles.emptyText, { color: colors.danger }]}>{error}</Text> : null}
            <PrimaryButton label={selectedRideIds.length ? `Add ${selectedRideIds.length} ride${selectedRideIds.length === 1 ? "" : "s"}` : "Select rides"} icon="add-circle" disabled={!selectedRideIds.length} loading={addingRides} onPress={addSelectedRides} />
          </View>
        </Screen>
      </Modal>
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
  emptyText: { fontFamily: typography.regular, fontSize: 13, lineHeight: 19 },
  dangerArea: { borderWidth: 1, borderRadius: 20, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  dangerCopy: { flex: 1, minWidth: 0, gap: 3 },
  dangerTitle: { fontFamily: typography.bold, fontSize: 14 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.58)" },
  modalDismiss: { ...StyleSheet.absoluteFillObject },
  sheet: { borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 20, paddingBottom: 34, gap: 13 },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  sheetTitle: { flex: 1, fontFamily: typography.extraBold, fontSize: 22 },
  closeButton: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 15, paddingHorizontal: 13, fontFamily: typography.medium, fontSize: 13 },
  descriptionInput: { minHeight: 92, paddingTop: 12 },
  pickerContent: { flex: 1, padding: 18, paddingBottom: 28, gap: 14 },
  pickerTitle: { fontFamily: typography.extraBold, fontSize: 23, lineHeight: 29 },
  pickerLoading: { flex: 1, alignItems: "center", justifyContent: "center" },
  pickerList: { gap: 10, paddingBottom: 10 },
  pickerRide: { minHeight: 68, borderWidth: 1, borderColor: "transparent", borderRadius: 18, padding: 12, flexDirection: "row", alignItems: "center", gap: 11 },
  pickerRideTitle: { fontFamily: typography.bold, fontSize: 14 }
});
