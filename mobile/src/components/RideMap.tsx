import React, { useMemo } from "react";
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
  const mapCoordinates = useMemo(() => normalizeCoordinates(coordinates), [coordinates]);
  const mapCurrent = current ? normalizeCoordinate(current) : null;
  const initial = mapCurrent || mapCoordinates[0] || { latitude: 12.9716, longitude: 77.5946 };

  return (
    <MapView
      provider={PROVIDER_GOOGLE}
      googleRenderer="LEGACY"
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
      {mapCoordinates.length > 1 ? (
        <Polyline coordinates={mapCoordinates} strokeColor={colors.orange} strokeWidth={5} />
      ) : null}
      {mapCoordinates[0] ? <Marker coordinate={mapCoordinates[0]} title="Start" pinColor={colors.success} /> : null}
      {mapCoordinates.length > 1 ? (
        <Marker coordinate={mapCoordinates[mapCoordinates.length - 1]} title="End" pinColor={colors.orange} />
      ) : null}
    </MapView>
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
  map: {
    width: "100%",
    height: 260,
    borderRadius: 8
  }
});
