import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { fetchRoute, geocodeDestination, RouteDetails } from "../api/googleMaps";
import { PrimaryButton } from "../components/PrimaryButton";
import { SafetyModal } from "../components/SafetyModal";
import { Screen } from "../components/Screen";
import { ThemeColors } from "../theme/colors";
import { useTheme, useThemedStyles } from "../theme/ThemeContext";
import { Coordinate } from "../types";

export function NavigateScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const mapRef = useRef<MapView | null>(null);
  const [destination, setDestination] = useState("");
  const [current, setCurrent] = useState<Coordinate | null>(null);
  const [route, setRoute] = useState<RouteDetails | null>(null);
  const [speed, setSpeed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [safetyVisible, setSafetyVisible] = useState(false);
  const [mapFullScreen, setMapFullScreen] = useState(false);
  const pendingNavigation = useRef(false);
  const subscription = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    return () => {
      subscription.current?.remove();
    };
  }, []);

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

      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      const origin = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };
      setCurrent(origin);

      subscription.current?.remove();
      subscription.current = null;
      subscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Highest,
          distanceInterval: 8,
          timeInterval: 3000
        },
        (location) => {
          setCurrent({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude
          });
          setSpeed(Math.max(0, (location.coords.speed || 0) * 3.6));
        }
      );

      const destinationPoint = await geocodeDestination(destination);
      const nextRoute = await fetchRoute(origin, destinationPoint);
      setRoute(nextRoute);
    } catch (err: any) {
      setError(err.message || "Navigation unavailable. Check internet and Maps API key.");
    } finally {
      setLoading(false);
    }
  }

  const initial = current || { latitude: 12.9716, longitude: 77.5946 };

  return (
    <Screen>
      <SafetyModal visible={safetyVisible} onAccept={startNavigationAfterSafety} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Plan before you move</Text>
          <Text style={styles.title}>Navigate</Text>
          <Text style={styles.subtitle}>Set your destination, review the route, then ride safely.</Text>
        </View>
        <View style={styles.searchRow}>
          <TextInput
            value={destination}
            onChangeText={setDestination}
            placeholder="Enter destination"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          <PrimaryButton label="Go" icon="navigate" loading={loading} onPress={requestRoute} />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.mapShell}>
          <NavigationMap
            mapRef={mapRef}
            initial={initial}
            route={route}
            colors={colors}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open navigation map full screen"
            onPress={() => setMapFullScreen(true)}
            style={styles.expandButton}
          >
            <Ionicons name="expand" size={22} color={colors.text} />
          </Pressable>
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
            <Text style={styles.metricLabel}>Speed</Text>
            <Text style={styles.metricValue}>{Math.round(speed)} km/h</Text>
          </View>
          <View>
            <Text style={styles.metricLabel}>Progress</Text>
            <Text style={styles.metricValue}>{progress}%</Text>
          </View>
        </View>

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
        visible={mapFullScreen}
        animationType="slide"
        onRequestClose={() => setMapFullScreen(false)}
      >
        <View style={styles.fullScreen}>
          <NavigationMap
            initial={initial}
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
    () => (route?.coordinates || []).filter(isCoordinate),
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
      showsUserLocation
      followsUserLocation
      initialRegion={{ ...initial, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
    >
      {coordinates.length > 1 ? <Polyline coordinates={coordinates} strokeColor={colors.orange} strokeWidth={5} /> : null}
      {start ? <Marker coordinate={start} title="Start" /> : null}
      {destination ? <Marker coordinate={destination} title="Destination" pinColor={colors.orange} /> : null}
    </MapView>
  );
}

function isCoordinate(coordinate?: Coordinate | null) {
  const latitude = Number(coordinate?.latitude);
  const longitude = Number(coordinate?.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}

const createStyles = (colors: ThemeColors) => ({
  content: {
    padding: 16,
    paddingBottom: 110,
    gap: 14
  },
  header: {
    gap: 4,
    paddingTop: 4
  },
  kicker: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  title: {
    color: colors.text,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "900"
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 19
  },
  searchRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    padding: 8,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1
  },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceHigh,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 50,
    color: colors.text,
    paddingHorizontal: 12,
    fontSize: 15
  },
  mapShell: {
    width: "100%",
    height: 320,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: colors.surface
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
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 11
  },
  metricValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 3
  },
  step: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10
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
