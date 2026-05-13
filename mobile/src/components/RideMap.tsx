import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { Coordinate } from "../types";
import { colors } from "../theme/colors";

const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#1d1d1f" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#d6d6d6" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1d1d1f" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#33343a" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#4a3323" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#101827" }] }
];

export function RideMap({
  coordinates,
  current,
  style,
  title = "Ride map",
  fullScreenEnabled = true
}: {
  coordinates: Coordinate[];
  current?: Coordinate | null;
  style?: StyleProp<ViewStyle>;
  title?: string;
  fullScreenEnabled?: boolean;
}) {
  const [fullScreenVisible, setFullScreenVisible] = useState(false);
  const mapRef = useRef<MapView | null>(null);
  const mapCoordinates = useMemo(() => normalizeCoordinates(coordinates), [coordinates]);
  const mapCurrent = current ? normalizeCoordinate(current) : null;
  const initial = mapCurrent || mapCoordinates[0] || { latitude: 12.9716, longitude: 77.5946 };

  useEffect(() => {
    if (mapCoordinates.length < 2) {
      return;
    }

    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(mapCoordinates, {
        edgePadding: { top: 60, right: 45, bottom: 60, left: 45 },
        animated: true
      });
    }, 500);

    return () => clearTimeout(timer);
  }, [mapCoordinates]);

  return (
    <View style={[styles.shell, style]}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        googleRenderer="LEGACY"
        style={StyleSheet.absoluteFill}
        customMapStyle={darkMapStyle}
        showsUserLocation
        followsUserLocation
        initialRegion={{
          ...initial,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04
        }}
      >
        {mapCoordinates.length > 1 ? (
          <Polyline coordinates={mapCoordinates} strokeColor={colors.orange} strokeWidth={5} />
        ) : null}
        {mapCoordinates[0] ? <Marker coordinate={mapCoordinates[0]} title="Start" pinColor={colors.success} /> : null}
        {mapCoordinates.length > 1 ? (
          <Marker coordinate={mapCoordinates[mapCoordinates.length - 1]} title="End" pinColor={colors.orange} />
        ) : null}
      </MapView>
      {fullScreenEnabled ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open map full screen"
          onPress={() => setFullScreenVisible(true)}
          style={styles.expandButton}
        >
          <Ionicons name="expand" size={22} color={colors.text} />
        </Pressable>
      ) : null}
      <Modal
        visible={fullScreenVisible}
        animationType="slide"
        onRequestClose={() => setFullScreenVisible(false)}
      >
        <View style={styles.fullScreen}>
          <RideMap
            coordinates={mapCoordinates}
            current={mapCurrent}
            style={styles.fullScreenMap}
            fullScreenEnabled={false}
          />
          <View style={styles.fullScreenFooter}>
            <Text style={styles.fullScreenTitle} numberOfLines={1}>{title}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close full screen map"
              onPress={() => setFullScreenVisible(false)}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={26} color={colors.text} />
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function normalizeCoordinates(coordinates: Coordinate[]) {
  return coordinates
    .map(normalizeCoordinate)
    .filter((coordinate): coordinate is Coordinate => Boolean(coordinate));
}

function normalizeCoordinate(coordinate: Coordinate) {
  const latitude = Number(coordinate.latitude);
  const longitude = Number(coordinate.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

const styles = StyleSheet.create({
  shell: {
    width: "100%",
    height: 260,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: colors.surface
  },
  expandButton: {
    position: "absolute",
    right: 12,
    bottom: 22,
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8, 9, 11, 0.82)",
    borderColor: colors.border,
    borderWidth: 1
  },
  fullScreen: {
    flex: 1,
    backgroundColor: colors.background
  },
  fullScreenMap: {
    flex: 1,
    width: "100%",
    height: "100%",
    borderRadius: 0
  },
  fullScreenFooter: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 28,
    minHeight: 58,
    borderRadius: 8,
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
    backgroundColor: colors.orange
  }
});
