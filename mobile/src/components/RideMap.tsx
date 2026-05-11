import React from "react";
import { StyleSheet } from "react-native";
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
  current
}: {
  coordinates: Coordinate[];
  current?: Coordinate | null;
}) {
  const initial = current || coordinates[0] || { latitude: 12.9716, longitude: 77.5946 };

  return (
    <MapView
      provider={PROVIDER_GOOGLE}
      style={styles.map}
      customMapStyle={darkMapStyle}
      showsUserLocation
      followsUserLocation
      initialRegion={{
        ...initial,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04
      }}
    >
      {coordinates.length > 1 ? (
        <Polyline coordinates={coordinates} strokeColor={colors.orange} strokeWidth={5} />
      ) : null}
      {coordinates[0] ? <Marker coordinate={coordinates[0]} title="Start" pinColor={colors.success} /> : null}
      {coordinates.length > 1 ? (
        <Marker coordinate={coordinates[coordinates.length - 1]} title="End" pinColor={colors.orange} />
      ) : null}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    width: "100%",
    height: 260,
    borderRadius: 8
  }
});
