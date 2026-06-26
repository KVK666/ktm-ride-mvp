import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { RouteArtwork } from "./RouteArtwork";
import { typography } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { RideMemory } from "../types";

export function MemoryCard({ memory, onPress }: { memory: RideMemory; onPress: () => void }) {
  const { colors } = useTheme();
  const ride = memory.ride || null;
  const isAlbum = memory.type === "album";
  const isReview = memory.type === "review";
  const tone = isAlbum ? colors.accent : isReview ? colors.yellow : colors.blue;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, { backgroundColor: colors.surface }, pressed && styles.pressed]}>
      {memory.coverUri ? (
        <Image source={{ uri: memory.coverUri }} style={styles.cover} />
      ) : (
        <RouteArtwork
          coordinates={ride?.routePreview || ride?.points}
          start={ride ? { latitude: ride.startLatitude, longitude: ride.startLongitude } : null}
          end={ride ? { latitude: ride.endLatitude, longitude: ride.endLongitude } : null}
          height={190}
          style={styles.routeCover}
        />
      )}
      <LinearGradient colors={["transparent", `${colors.background}D9`, colors.background]} style={styles.fade} />
      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={[styles.typeBadge, { backgroundColor: `${tone}26` }]}>
            <Ionicons name={isAlbum ? "images" : isReview ? "create" : "sparkles"} color={tone} size={14} />
            <Text style={[styles.typeText, { color: tone }]}>{isAlbum ? "ALBUM" : isReview ? "REVIEW" : "MEMORY"}</Text>
          </View>
          {memory.photoCount ? <Text style={[styles.count, { color: colors.text }]}>{memory.photoCount}</Text> : null}
        </View>
        <Text numberOfLines={2} style={[styles.title, { color: colors.text }]}>{memory.title}</Text>
        <Text numberOfLines={1} style={[styles.subtitle, { color: colors.textSoft }]}>{memory.subtitle}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: 236, height: 300, borderRadius: 30, overflow: "hidden" },
  cover: { width: "100%", height: "100%" },
  routeCover: { height: "100%", borderRadius: 0 },
  fade: { ...StyleSheet.absoluteFillObject, top: 86 },
  body: { position: "absolute", left: 14, right: 14, bottom: 15, gap: 8 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  typeBadge: { alignSelf: "flex-start", minHeight: 26, borderRadius: 999, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 5 },
  typeText: { fontFamily: typography.bold, fontSize: 9, letterSpacing: 0.8 },
  count: { fontFamily: typography.extraBold, fontSize: 18 },
  title: { fontFamily: typography.extraBold, fontSize: 22, lineHeight: 27, letterSpacing: -0.4 },
  subtitle: { fontFamily: typography.medium, fontSize: 12 },
  pressed: { opacity: 0.86, transform: [{ scale: 0.99 }] }
});
