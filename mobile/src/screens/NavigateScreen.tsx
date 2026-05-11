import * as Location from "expo-location";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { fetchRoute, geocodeDestination, RouteDetails } from "../api/googleMaps";
import { PrimaryButton } from "../components/PrimaryButton";
import { SafetyModal } from "../components/SafetyModal";
import { Screen } from "../components/Screen";
import { colors } from "../theme/colors";
import { Coordinate } from "../types";

export function NavigateScreen() {
  const [destination, setDestination] = useState("");
  const [current, setCurrent] = useState<Coordinate | null>(null);
  const [route, setRoute] = useState<RouteDetails | null>(null);
  const [speed, setSpeed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [safetyVisible, setSafetyVisible] = useState(false);
  const pendingNavigation = useRef(false);
  const subscription = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    return () => {
      subscription.current?.remove();
    };
  }, []);

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

        <MapView
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          showsUserLocation
          followsUserLocation
          initialRegion={{ ...initial, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
        >
          {route ? <Polyline coordinates={route.coordinates} strokeColor={colors.orange} strokeWidth={5} /> : null}
          {route?.coordinates[0] ? <Marker coordinate={route.coordinates[0]} title="Start" /> : null}
          {route?.coordinates.length ? (
            <Marker coordinate={route.coordinates[route.coordinates.length - 1]} title="Destination" pinColor={colors.orange} />
          ) : null}
        </MapView>

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
              <Text style={styles.stepMeta}>{step.distanceText} · {step.durationText}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 14
  },
  searchRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center"
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 58,
    color: colors.text,
    paddingHorizontal: 14,
    fontSize: 16
  },
  map: {
    width: "100%",
    height: 360,
    borderRadius: 8
  },
  navPanel: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 12
  },
  metricValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 4
  },
  step: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12
  },
  stepIndex: {
    width: 30,
    height: 30,
    borderRadius: 15,
    textAlign: "center",
    textAlignVertical: "center",
    backgroundColor: colors.orange,
    color: colors.text,
    fontWeight: "900"
  },
  stepText: {
    flex: 1
  },
  stepInstruction: {
    color: colors.text,
    fontWeight: "800"
  },
  stepMeta: {
    color: colors.muted,
    marginTop: 4
  },
  error: {
    color: colors.danger
  }
});
