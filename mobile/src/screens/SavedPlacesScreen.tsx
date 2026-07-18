import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import * as Location from "expo-location";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { api } from "../api/client";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { ThemeColors, typography } from "../theme/colors";
import { useTheme, useThemedStyles } from "../theme/ThemeContext";
import { SavedPlace } from "../types";

type PlaceKind = "home" | "office" | "other";
type CapturedLocation = { latitude: number; longitude: number; accuracy: number | null };

export function SavedPlacesScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [kind, setKind] = useState<PlaceKind>("home");
  const [label, setLabel] = useState("Home");
  const [radiusM, setRadiusM] = useState(180);
  const [captured, setCaptured] = useState<CapturedLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api<{ places: SavedPlace[] }>("/places");
      setPlaces(Array.isArray(response.places) ? response.places : []);
    } catch (error: any) {
      setMessage(error?.message || "Unable to load saved places.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function chooseKind(nextKind: PlaceKind) {
    setKind(nextKind);
    if (!label.trim() || ["Home", "Office"].includes(label.trim())) {
      setLabel(nextKind === "home" ? "Home" : nextKind === "office" ? "Office" : "");
    }
    setMessage("");
  }

  async function currentLocation(): Promise<CapturedLocation> {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") throw new Error("Location permission is needed to save this place.");
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null
    };
  }

  async function captureLocation() {
    setLocating(true);
    setMessage("");
    try {
      setCaptured(await currentLocation());
      setMessage("Location captured. You can save it now.");
    } catch (error: any) {
      setMessage(error?.message || "Unable to get your current location.");
    } finally {
      setLocating(false);
    }
  }

  async function savePlace() {
    if (!captured) return setMessage("Use your current location before saving.");
    if (!label.trim()) return setMessage("Name this place first.");
    setSaving(true);
    setMessage("");
    try {
      const response = await api<{ place: SavedPlace }>("/places", {
        method: "POST",
        body: JSON.stringify({ label: label.trim(), kind, radiusM, latitude: captured.latitude, longitude: captured.longitude })
      });
      setPlaces((current) => [response.place, ...current.filter((place) => place.id !== response.place.id)]);
      setCaptured(null);
      setMessage(`${label.trim()} saved. Future rides can use this name.`);
    } catch (error: any) {
      setMessage(error?.message || "Unable to save this place.");
    } finally {
      setSaving(false);
    }
  }

  async function updatePlaceHere(place: SavedPlace) {
    setUpdatingId(place.id);
    setMessage("");
    try {
      const location = await currentLocation();
      await api(`/places/${place.id}`, {
        method: "PATCH",
        body: JSON.stringify({ label: place.label, kind: place.kind, radiusM: place.radiusM, latitude: location.latitude, longitude: location.longitude })
      });
      setMessage(`${place.label} moved to your current location.`);
      await load();
    } catch (error: any) {
      setMessage(error?.message || "Unable to update this place.");
    } finally {
      setUpdatingId(null);
    }
  }

  function confirmDelete(place: SavedPlace) {
    Alert.alert("Remove saved place?", `${place.label} will no longer be used to recognise future rides.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => deletePlace(place) }
    ]);
  }

  async function deletePlace(place: SavedPlace) {
    try {
      await api(`/places/${place.id}`, { method: "DELETE" });
      setPlaces((current) => current.filter((item) => item.id !== place.id));
      setMessage(`${place.label} removed.`);
    } catch (error: any) {
      setMessage(error?.message || "Unable to remove this place.");
    }
  }

  return (
    <Screen includeTopInset={false}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.kicker}>SMART ROUTINES</Text>
          <Text style={styles.title}>Saved places</Text>
          <Text style={styles.subtitle}>Teach RidePulse the places that matter. Route endpoints are matched within your chosen radius so normal GPS drift does not break a routine.</Text>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Add where you are now</Text>
          <View style={styles.kindRow}>
            {(["home", "office", "other"] as PlaceKind[]).map((item) => (
              <Pressable key={item} onPress={() => chooseKind(item)} style={[styles.kindButton, kind === item && styles.kindButtonActive]}>
                <Ionicons name={item === "home" ? "home" : item === "office" ? "business" : "location"} color={kind === item ? colors.onAccent : colors.text} size={17} />
                <Text style={[styles.kindText, kind === item && styles.kindTextActive]}>{item === "other" ? "Other" : item[0].toUpperCase() + item.slice(1)}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.inputLabel}>Place name</Text>
          <TextInput value={label} onChangeText={setLabel} maxLength={60} placeholder="Gym, family, favourite cafe" placeholderTextColor={colors.muted} style={styles.input} />
          <Text style={styles.inputLabel}>Matching radius</Text>
          <View style={styles.radiusRow}>
            {[120, 180, 300].map((radius) => (
              <Pressable key={radius} onPress={() => setRadiusM(radius)} style={[styles.radiusButton, radiusM === radius && styles.radiusButtonActive]}>
                <Text style={styles.radiusText}>{radius} m</Text>
              </Pressable>
            ))}
          </View>
          <Pressable disabled={locating} onPress={captureLocation} style={styles.captureButton}>
            {locating ? <ActivityIndicator color={colors.accent} /> : <Ionicons name="locate" color={colors.accent} size={20} />}
            <Text style={styles.captureText}>{captured ? "Location captured" : "Use current location"}</Text>
            {captured?.accuracy != null ? <Text style={styles.accuracy}>±{Math.round(captured.accuracy)} m</Text> : null}
          </Pressable>
          <PrimaryButton label="Save place" icon="bookmark" loading={saving} onPress={savePlace} />
        </View>

        {message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}

        <View style={styles.listSection}>
          <Text style={styles.sectionTitle}>Your places</Text>
          {loading ? <ActivityIndicator color={colors.accent} /> : places.map((place) => (
            <View key={place.id} style={styles.placeCard}>
              <View style={styles.placeIcon}><Ionicons name={place.kind === "home" ? "home" : place.kind === "office" ? "business" : "location"} color={colors.accent} size={21} /></View>
              <View style={styles.placeText}>
                <Text style={styles.placeName}>{place.label}</Text>
                <Text style={styles.placeMeta}>{place.radiusM} m match radius · {place.kind}</Text>
              </View>
              <Pressable accessibilityLabel={`Move ${place.label} to current location`} disabled={updatingId === place.id} onPress={() => updatePlaceHere(place)} style={styles.iconButton}>
                {updatingId === place.id ? <ActivityIndicator color={colors.text} /> : <Ionicons name="locate" color={colors.text} size={18} />}
              </Pressable>
              <Pressable accessibilityLabel={`Remove ${place.label}`} onPress={() => confirmDelete(place)} style={styles.iconButton}>
                <Ionicons name="trash" color={colors.danger} size={18} />
              </Pressable>
            </View>
          ))}
          {!loading && !places.length ? <Text style={styles.empty}>No saved places yet. Add Home or Office while you are there.</Text> : null}
        </View>

        <View style={styles.privacy}><Ionicons name="shield-checkmark" color={colors.blue} size={20} /><Text style={styles.privacyText}>Saved places are private to your account. RidePulse sends only matched place names—not your full GPS trace—to optional ride intelligence.</Text></View>
      </ScrollView>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => ({
  content: { padding: 20, paddingBottom: 56, gap: 18 }, header: { gap: 5 },
  kicker: { color: colors.accent, fontFamily: typography.bold, fontSize: 10, letterSpacing: 1.3 },
  title: { color: colors.text, fontFamily: typography.extraBold, fontSize: 34 },
  subtitle: { color: colors.muted, fontFamily: typography.regular, fontSize: 13, lineHeight: 20 },
  formCard: { backgroundColor: colors.surface, borderRadius: 26, padding: 17, gap: 12 },
  sectionTitle: { color: colors.text, fontFamily: typography.extraBold, fontSize: 20 },
  kindRow: { flexDirection: "row", gap: 8 },
  kindButton: { flex: 1, minHeight: 46, borderRadius: 15, backgroundColor: colors.elevated, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  kindButtonActive: { backgroundColor: colors.accent }, kindText: { color: colors.text, fontFamily: typography.bold, fontSize: 12 }, kindTextActive: { color: colors.onAccent },
  inputLabel: { color: colors.muted, fontFamily: typography.bold, fontSize: 11, marginTop: 2 },
  input: { minHeight: 50, borderRadius: 16, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 14, fontFamily: typography.medium },
  radiusRow: { flexDirection: "row", gap: 8 }, radiusButton: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.border },
  radiusButtonActive: { borderColor: colors.accent }, radiusText: { color: colors.text, fontFamily: typography.bold, fontSize: 12 },
  captureButton: { minHeight: 50, borderRadius: 16, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 14 },
  captureText: { flex: 1, color: colors.text, fontFamily: typography.bold }, accuracy: { color: colors.muted, fontFamily: typography.medium, fontSize: 11 },
  message: { color: colors.accent, fontFamily: typography.bold, fontSize: 12, lineHeight: 18 }, listSection: { gap: 11 },
  placeCard: { minHeight: 76, borderRadius: 21, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  placeIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: `${colors.accent}15`, alignItems: "center", justifyContent: "center" }, placeText: { flex: 1 },
  placeName: { color: colors.text, fontFamily: typography.extraBold, fontSize: 16 }, placeMeta: { color: colors.muted, fontFamily: typography.medium, fontSize: 10, marginTop: 3, textTransform: "capitalize" },
  iconButton: { width: 39, height: 39, borderRadius: 13, backgroundColor: colors.elevated, alignItems: "center", justifyContent: "center" },
  empty: { color: colors.muted, fontFamily: typography.medium, fontSize: 13, lineHeight: 20, paddingVertical: 10 },
  privacy: { flexDirection: "row", gap: 10, borderRadius: 19, padding: 14, backgroundColor: `${colors.blue}12` }, privacyText: { flex: 1, color: colors.muted, fontFamily: typography.regular, fontSize: 11, lineHeight: 17 }
});
