import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { Coordinate, RidePhoto } from "../types";
import { useTheme } from "../theme/ThemeContext";
import { normalizeBoundedCoordinate, normalizeBoundedCoordinates, sampleEvenly } from "../utils/coordinates";

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
  fullScreenEnabled = true,
  photoMarkers = [],
  onPhotoMarkerPress
}: {
  coordinates: Coordinate[];
  current?: Coordinate | null;
  style?: StyleProp<ViewStyle>;
  title?: string;
  fullScreenEnabled?: boolean;
  photoMarkers?: RidePhoto[];
  onPhotoMarkerPress?: (photo: RidePhoto) => void;
}) {
  const { colors } = useTheme();
  const [fullScreenVisible, setFullScreenVisible] = useState(false);
  const mapRef = useRef<MapView | null>(null);
  const mapCoordinates = useMemo(() => normalizeBoundedCoordinates(coordinates), [coordinates]);
  const renderCoordinates = useMemo(() => sampleEvenly(mapCoordinates, 1200), [mapCoordinates]);
  const mapPhotoMarkers = useMemo(
    () =>
      photoMarkers.flatMap((photo) => {
        if (!photo.hasLocation) {
          return [];
        }
        const coordinate = normalizeBoundedCoordinate(photo);
        return coordinate ? [{ ...photo, ...coordinate }] : [];
      }),
    [photoMarkers]
  );
  const mapCurrent = current ? normalizeBoundedCoordinate(current) : null;
  const initial = mapCurrent || mapCoordinates[0];

  useEffect(() => {
    if (renderCoordinates.length < 2) {
      return;
    }

    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(renderCoordinates, {
        edgePadding: { top: 60, right: 45, bottom: 60, left: 45 },
        animated: true
      });
    }, 500);

    return () => clearTimeout(timer);
  }, [renderCoordinates]);

  if (!initial) {
    return (
      <View style={[styles.shell, styles.emptyMap, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>
        <View style={[styles.emptyMapIcon, { backgroundColor: colors.surfaceHigh }]}>
          <Ionicons name="locate-outline" size={24} color={colors.accent} />
        </View>
        <Text style={[styles.emptyMapTitle, { color: colors.text }]}>Map centers when GPS is ready</Text>
        <Text style={[styles.emptyMapCopy, { color: colors.muted }]}>Start recording to lock onto your current road.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.shell, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>
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
        {renderCoordinates.length > 1 ? (
          <Polyline coordinates={renderCoordinates} strokeColor={colors.accent} strokeWidth={5} />
        ) : null}
        {mapCoordinates[0] ? <Marker coordinate={mapCoordinates[0]} title="Start" pinColor={colors.success} /> : null}
        {mapCoordinates.length > 1 ? (
          <Marker coordinate={mapCoordinates[mapCoordinates.length - 1]} title="End" pinColor={colors.accent} />
        ) : null}
        {mapPhotoMarkers.map((photo, index) => (
          <Marker
            key={photo.id}
            coordinate={{ latitude: photo.latitude, longitude: photo.longitude }}
            title={`Photo stop ${index + 1}`}
            description={new Date(photo.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            onPress={() => {
              if (onPhotoMarkerPress) {
                setFullScreenVisible(false);
                requestAnimationFrame(() => onPhotoMarkerPress(photo));
              }
            }}
          >
            <View style={[styles.photoMarker, { backgroundColor: colors.blue, borderColor: colors.text }]}>
              <Ionicons name="camera" size={16} color={colors.text} />
            </View>
          </Marker>
        ))}
      </MapView>
      {fullScreenEnabled ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open map full screen"
          onPress={() => setFullScreenVisible(true)}
          style={[styles.expandButton, { backgroundColor: colors.overlay, borderColor: colors.border }]}
        >
          <Ionicons name="expand" size={22} color={colors.text} />
        </Pressable>
      ) : null}
      <Modal
        visible={fullScreenVisible}
        animationType="slide"
        onRequestClose={() => setFullScreenVisible(false)}
      >
        <View style={[styles.fullScreen, { backgroundColor: colors.background }]}>
          <RideMap
            coordinates={mapCoordinates}
            current={mapCurrent}
            photoMarkers={photoMarkers}
            onPhotoMarkerPress={onPhotoMarkerPress}
            style={styles.fullScreenMap}
            fullScreenEnabled={false}
          />
          <View style={[styles.fullScreenFooter, { backgroundColor: colors.overlay, borderColor: colors.border }]}>
            <Text style={[styles.fullScreenTitle, { color: colors.text }]} numberOfLines={1}>{title}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close full screen map"
              onPress={() => setFullScreenVisible(false)}
              style={[styles.closeButton, { backgroundColor: colors.accent }]}
            >
              <Ionicons name="close" size={26} color={colors.text} />
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: "100%",
    height: 260,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1
  },
  emptyMap: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28
  },
  emptyMapIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14
  },
  emptyMapTitle: {
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center"
  },
  emptyMapCopy: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center"
  },
  expandButton: {
    position: "absolute",
    right: 12,
    bottom: 22,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1
  },
  fullScreen: {
    flex: 1
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
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 12,
    paddingRight: 8
  },
  fullScreenTitle: {
    flex: 1,
    fontWeight: "900",
    fontSize: 15
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center"
  },
  photoMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center"
  }
});
