import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { fetchRoute, geocodeDestination, RouteDetails } from "../api/googleMaps";
import { api } from "../api/client";
import { PrimaryButton } from "../components/PrimaryButton";
import { SafetyModal } from "../components/SafetyModal";
import { Screen } from "../components/Screen";
import { ThemeColors, typography } from "../theme/colors";
import { useTheme, useThemedStyles } from "../theme/ThemeContext";
import { Coordinate, SavedPlace } from "../types";
import { normalizeBoundedCoordinates } from "../utils/coordinates";

export function NavigateScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<any>();
  const mapRef = useRef<MapView | null>(null);
  const [destination, setDestination] = useState("");
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<SavedPlace | null>(null);
  const [current, setCurrent] = useState<Coordinate | null>(null);
  const [route, setRoute] = useState<RouteDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [safetyVisible, setSafetyVisible] = useState(false);
  const [mapFullScreen, setMapFullScreen] = useState(false);
  const pendingNavigation = useRef(false);
  const loadPlaces = useCallback(() => {
    api<{ places: SavedPlace[] }>("/places")
      .then((response) => setSavedPlaces(Array.isArray(response.places) ? response.places : []))
      .catch(() => setSavedPlaces([]));
  }, []);

  useFocusEffect(useCallback(() => { loadPlaces(); }, [loadPlaces]));

  useEffect(() => {
    if (!route?.coordinates.length) {
      return;
    }

    mapRef.current?.fitToCoordinates(route.coordinates, {
      edgePadding: { top: 70, right: 45, bottom: 70, left: 45 },
      animated: true
    });
  }, [route]);

  const progress = useMemo(() => {
    if (!current || !route?.coordinates.length) {
      return 0;
    }
    let nearestIndex = 0;
    let nearestDistance = Number.MAX_SAFE_INTEGER;
    route.coordinates.forEach((coordinate, index) => {
      const dLat = coordinate.latitude - current.latitude;
      const dLon = coordinate.longitude - current.longitude;
      const score = dLat * dLat + dLon * dLon;
      if (score < nearestDistance) {
        nearestDistance = score;
        nearestIndex = index;
      }
    });
    return Math.round((nearestIndex / Math.max(1, route.coordinates.length - 1)) * 100);
  }, [current, route]);

  async function requestRoute() {
    if (loading) {
      return;
    }

    if (!destination.trim()) {
      setError("Enter a destination first");
      return;
    }
    pendingNavigation.current = true;
    setSafetyVisible(true);
  }

  async function startNavigationAfterSafety() {
    setSafetyVisible(false);
    if (!pendingNavigation.current) {
      return;
    }
    pendingNavigation.current = false;
    setLoading(true);
    setError("");

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        throw new Error("Location permission is required for navigation");
      }

      const position = await getBoundedPlannerLocation();
      const origin = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };
      setCurrent(origin);

      const destinationPoint = selectedPlace && destination === selectedPlace.label
        ? { latitude: selectedPlace.latitude, longitude: selectedPlace.longitude }
        : await geocodeDestination(destination);
      const nextRoute = await fetchRoute(origin, destinationPoint);
      setRoute(nextRoute);
    } catch (err: any) {
      setError(err.message || "Navigation unavailable. Check internet and Maps API key.");
    } finally {
      setLoading(false);
    }
  }

  const mapInitial = current || route?.coordinates[0] || null;

  return (
    <Screen>
      <SafetyModal visible={safetyVisible} onAccept={startNavigationAfterSafety} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.kicker}>PLAN BEFORE YOU MOVE</Text>
          <Text style={styles.title}>Plan a route</Text>
          <Text style={styles.subtitle}>A clear route preview for the road ahead—not turn-by-turn navigation.</Text>
        </View>
        <View style={styles.searchRow}>
          <TextInput
            accessibilityLabel="Destination"
            value={destination}
            onChangeText={(value) => { setDestination(value); setSelectedPlace(null); }}
            placeholder="Where are you riding?"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          <PrimaryButton label="Preview" icon="navigate" loading={loading} onPress={requestRoute} />
        </View>
        {savedPlaces.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.placeChips}>
            {savedPlaces.map((place) => (
              <Pressable
                key={place.id}
                onPress={() => { setSelectedPlace(place); setDestination(place.label); setError(""); }}
                style={[styles.placeChip, selectedPlace?.id === place.id && styles.placeChipActive]}
              >
                <Ionicons name={place.kind === "home" ? "home" : place.kind === "office" ? "business" : "location"} color={selectedPlace?.id === place.id ? colors.onAccent : colors.text} size={16} />
                <Text style={[styles.placeChipText, selectedPlace?.id === place.id && styles.placeChipTextActive]}>{place.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        <Pressable accessibilityRole="button" onPress={() => navigation.navigate("SavedPlaces")} style={styles.managePlaces}>
          <Ionicons name="settings-outline" color={colors.accent} size={17} />
          <Text style={styles.managePlacesText}>Manage saved places</Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.mapShell}>
          {mapInitial ? (
            <>
              <NavigationMap mapRef={mapRef} initial={mapInitial} route={route} colors={colors} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open navigation map full screen"
                onPress={() => setMapFullScreen(true)}
                style={styles.expandButton}
              >
                <Ionicons name="expand" size={22} color={colors.text} />
              </Pressable>
            </>
          ) : (
            <View style={styles.mapPlaceholder}>
              <View style={styles.mapPlaceholderIcon}>
                <Ionicons name="navigate-outline" size={25} color={colors.accent} />
              </View>
              <Text style={styles.mapPlaceholderTitle}>Your route starts here</Text>
              <Text style={styles.mapPlaceholderCopy}>Enter a destination to center the map on your current location.</Text>
            </View>
          )}
        </View>

        <View style={styles.navPanel}>
          <View>
            <Text style={styles.metricLabel}>ETA</Text>
            <Text style={styles.metricValue}>{route?.durationText || "--"}</Text>
          </View>
          <View>
            <Text style={styles.metricLabel}>Remaining</Text>
            <Text style={styles.metricValue}>{route?.distanceText || "--"}</Text>
          </View>
          <View>
            <Text style={styles.metricLabel}>Mode</Text>
            <Text style={styles.metricValue}>Preview</Text>
          </View>
          <View>
            <Text style={styles.metricLabel}>Progress</Text>
            <Text style={styles.metricValue}>{progress}%</Text>
          </View>
        </View>

        {route ? <PrimaryButton block label="Open in Google Maps" icon="open-outline" onPress={() => openInGoogleMaps(selectedPlace, destination, route)} /> : null}

        {route?.steps.slice(0, 8).map((step, index) => (
          <View key={`${step.instruction}-${index}`} style={styles.step}>
            <Text style={styles.stepIndex}>{index + 1}</Text>
            <View style={styles.stepText}>
              <Text style={styles.stepInstruction}>{step.instruction}</Text>
              <Text style={styles.stepMeta}>{step.distanceText} / {step.durationText}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
      <Modal
        visible={mapFullScreen && Boolean(mapInitial)}
        animationType="slide"
        onRequestClose={() => setMapFullScreen(false)}
      >
        <View style={styles.fullScreen}>
          <NavigationMap
            initial={mapInitial || { latitude: 0, longitude: 0 }}
            route={route}
            fullScreen
            colors={colors}
          />
          <View style={styles.fullScreenFooter}>
            <Text style={styles.fullScreenTitle} numberOfLines={1}>
              {destination.trim() || "Navigation map"}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close full screen map"
              onPress={() => setMapFullScreen(false)}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={26} color={colors.text} />
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

async function getBoundedPlannerLocation() {
  const cached = await Location.getLastKnownPositionAsync({ maxAge: 120000, requiredAccuracy: 150 });
  if (cached) return cached;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Current location is taking too long. Try again in an open area.")), 10000);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function openInGoogleMaps(place: SavedPlace | null, destinationText: string, route: RouteDetails) {
  const endpoint = route.coordinates[route.coordinates.length - 1];
  const destination = place
    ? `${place.latitude},${place.longitude}`
    : endpoint ? `${endpoint.latitude},${endpoint.longitude}` : destinationText.trim();
  Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`).catch(() => {});
}

function NavigationMap({
  mapRef,
  initial,
  route,
  fullScreen,
  colors
}: {
  mapRef?: React.RefObject<MapView>;
  initial: Coordinate;
  route: RouteDetails | null;
  fullScreen?: boolean;
  colors: ThemeColors;
}) {
  const localMapRef = useRef<MapView | null>(null);
  const activeRef = mapRef || localMapRef;
  const coordinates = useMemo(
    () => normalizeBoundedCoordinates(route?.coordinates || []),
    [route]
  );
  const start = coordinates[0];
  const destination = coordinates.length ? coordinates[coordinates.length - 1] : null;

  useEffect(() => {
    if (!coordinates.length) {
      return;
    }

    const timer = setTimeout(() => {
      activeRef.current?.fitToCoordinates(coordinates, {
        edgePadding: fullScreen
          ? { top: 80, right: 55, bottom: 110, left: 55 }
          : { top: 70, right: 45, bottom: 70, left: 45 },
        animated: true
      });
    }, 500);

    return () => clearTimeout(timer);
  }, [activeRef, coordinates, fullScreen]);

  return (
    <MapView
      ref={activeRef}
      provider={PROVIDER_GOOGLE}
      googleRenderer="LEGACY"
      style={StyleSheet.absoluteFill}
      showsUserLocation={false}
      followsUserLocation={false}
      initialRegion={{ ...initial, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
    >
      {coordinates.length > 1 ? <Polyline coordinates={coordinates} strokeColor={colors.orange} strokeWidth={5} /> : null}
      {start ? <Marker coordinate={start} title="Start" /> : null}
      {destination ? <Marker coordinate={destination} title="Destination" pinColor={colors.orange} /> : null}
    </MapView>
  );
}

const createStyles = (colors: ThemeColors) => ({
  content: {
    padding: 20,
    paddingBottom: 118,
    gap: 16
  },
  header: {
    gap: 4,
    paddingTop: 4
  },
  kicker: {
    color: colors.accent,
    fontSize: 10,
    fontFamily: typography.bold,
    letterSpacing: 1.35
  },
  title: {
    color: colors.text,
    fontSize: 34,
    lineHeight: 41,
    fontFamily: typography.extraBold
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: typography.regular
  },
  searchRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    padding: 8,
    borderRadius: 22,
    backgroundColor: colors.surface,
    elevation: 5
  },
  placeChips: { gap: 8, paddingRight: 20 },
  placeChip: { minHeight: 40, borderRadius: 14, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: colors.surface },
  placeChipActive: { backgroundColor: colors.accent },
  placeChipText: { color: colors.text, fontFamily: typography.bold, fontSize: 12 },
  placeChipTextActive: { color: colors.onAccent },
  managePlaces: { minHeight: 44, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 4 },
  managePlacesText: { color: colors.accent, fontFamily: typography.bold, fontSize: 12 },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceHigh,
    borderRadius: 16,
    minHeight: 50,
    color: colors.text,
    paddingHorizontal: 12,
    fontSize: 15,
    fontFamily: typography.medium
  },
  mapShell: {
    width: "100%",
    height: 430,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: colors.surface
  },
  mapPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32
  },
  mapPlaceholderIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    backgroundColor: colors.surfaceHigh
  },
  mapPlaceholderTitle: {
    color: colors.text,
    fontSize: 16,
    fontFamily: typography.extraBold,
    textAlign: "center"
  },
  mapPlaceholderCopy: {
    marginTop: 7,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: typography.regular,
    textAlign: "center"
  },
  expandButton: {
    position: "absolute",
    right: 12,
    bottom: 22,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8, 9, 11, 0.82)",
    borderColor: colors.border,
    borderWidth: 1
  },
  navPanel: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 16
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 10,
    fontFamily: typography.bold
  },
  metricValue: {
    color: colors.text,
    fontSize: 15,
    fontFamily: typography.extraBold,
    marginTop: 3
  },
  step: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 14
  },
  stepIndex: {
    width: 26,
    height: 26,
    borderRadius: 13,
    textAlign: "center",
    textAlignVertical: "center",
    backgroundColor: colors.accent,
    color: colors.text,
    fontWeight: "900"
  },
  stepText: {
    flex: 1
  },
  stepInstruction: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 14
  },
  stepMeta: {
    color: colors.muted,
    marginTop: 3,
    fontSize: 12
  },
  error: {
    color: colors.danger
  },
  fullScreen: {
    flex: 1,
    backgroundColor: colors.background
  },
  fullScreenFooter: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 28,
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: "rgba(8, 9, 11, 0.88)",
    borderColor: colors.border,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingLeft: 14,
    paddingRight: 8
  },
  fullScreenTitle: {
    flex: 1,
    color: colors.text,
    fontWeight: "900",
    fontSize: 16
  },
  closeButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent
  }
});
