import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { typography } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { Ride } from "../types";
import { duration, km, shortDate } from "../utils/format";
import { RideBadge } from "./RideBadge";
import { RouteArtwork } from "./RouteArtwork";

export function JournalHero({ ride, onPress }: { ride: Ride; onPress: () => void }) {
  const { colors } = useTheme();
  const start = { latitude: ride.startLatitude, longitude: ride.startLongitude };
  const end = { latitude: ride.endLatitude, longitude: ride.endLongitude };
  const title = ride.smartTitle || ride.title?.trim() || "Your latest escape";
  const badges = Array.isArray(ride.badges) ? ride.badges.slice(0, 3) : [];

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, { backgroundColor: colors.surface }, pressed && styles.pressed]}>
      <RouteArtwork coordinates={ride.routePreview || ride.points} start={start} end={end} height={300} style={styles.art} />
      <LinearGradient colors={["transparent", `${colors.background}D9`, colors.background]} style={styles.fade} />
      <View style={styles.body}>
        <View style={styles.kickerRow}>
          <Text style={[styles.kicker, { color: colors.accent }]}>YOUR LATEST ESCAPE</Text>
          <Ionicons name="arrow-up-outline" color={colors.text} size={20} style={styles.arrow} />
        </View>
        <Text numberOfLines={2} style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text numberOfLines={2} style={[styles.summary, { color: colors.textSoft }]}>{ride.summaryText || ride.highlightReason || `${shortDate(ride.startedAt)} · ${duration(ride.durationS)}`}</Text>
        <View style={styles.footer}>
          <Text style={[styles.distance, { color: colors.text }]}>{km(ride.distanceM)}</Text>
          <View style={styles.badges}>
            {badges.map((badge, index) => <RideBadge key={`${badge}-${index}`} label={badge} tone={index === 0 ? "accent" : "blue"} />)}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 360, borderRadius: 34, overflow: "hidden" },
  art: { borderRadius: 0 },
  fade: { ...StyleSheet.absoluteFillObject, top: 96 },
  body: { position: "absolute", left: 18, right: 18, bottom: 18, gap: 8 },
  kickerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  kicker: { fontFamily: typography.bold, fontSize: 10, letterSpacing: 1.4 },
  arrow: { transform: [{ rotate: "45deg" }] },
  title: { fontFamily: typography.extraBold, fontSize: 33, lineHeight: 39, letterSpacing: -0.8 },
  summary: { fontFamily: typography.medium, fontSize: 13, lineHeight: 20 },
  footer: { flexDirection: "row", alignItems: "flex-end", gap: 12, marginTop: 4 },
  distance: { fontFamily: typography.extraBold, fontSize: 30, letterSpacing: -0.8 },
  badges: { flex: 1, flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: 6 },
  pressed: { opacity: 0.88, transform: [{ scale: 0.992 }] }
});
