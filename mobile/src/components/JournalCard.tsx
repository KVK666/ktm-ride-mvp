import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { typography } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { Ride } from "../types";
import { duration, km, shortDate } from "../utils/format";
import { RouteArtwork } from "./RouteArtwork";

export function JournalCard({ ride, onPress, featured = false }: { ride: Ride; onPress: () => void; featured?: boolean }) {
  const { colors } = useTheme();
  const start = { latitude: ride.startLatitude, longitude: ride.startLongitude };
  const end = { latitude: ride.endLatitude, longitude: ride.endLongitude };
  const title = ride.title?.trim() || `${ride.startLabel} to ${ride.endLabel}`;

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.card, { backgroundColor: colors.surface }, pressed && styles.pressed]}>
      <RouteArtwork coordinates={ride.routePreview || ride.points} start={start} end={end} height={featured ? 224 : 150} />
      <View style={styles.body}>
        <View style={styles.headingRow}>
          <View style={styles.titleBlock}>
            <Text numberOfLines={2} style={[styles.title, { color: colors.text }]}>{title}</Text>
            <Text style={[styles.meta, { color: colors.muted }]}>{shortDate(ride.startedAt)} · {duration(ride.durationS)}</Text>
          </View>
          {!ride.reviewedAt ? (
            <View style={[styles.badge, { backgroundColor: `${colors.accent}18` }]}>
              <Text style={[styles.badgeText, { color: colors.accent }]}>REVIEW</Text>
            </View>
          ) : <Ionicons name="arrow-forward" color={colors.muted} size={20} />}
        </View>
        <View style={styles.metricRow}>
          <Text style={[styles.distance, { color: colors.text }]}>{km(ride.distanceM)}</Text>
          <Text style={[styles.route, { color: colors.muted }]} numberOfLines={1}>{ride.startLabel} → {ride.endLabel}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 26, overflow: "hidden" },
  body: { padding: 16, gap: 14 },
  headingRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  titleBlock: { flex: 1, minWidth: 0 },
  title: { fontFamily: typography.bold, fontSize: 18, lineHeight: 24 },
  meta: { fontFamily: typography.medium, fontSize: 12, marginTop: 5 },
  metricRow: { flexDirection: "row", alignItems: "baseline", gap: 12 },
  distance: { fontFamily: typography.extraBold, fontSize: 24 },
  route: { flex: 1, fontFamily: typography.medium, fontSize: 12, textAlign: "right" },
  badge: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999 },
  badgeText: { fontFamily: typography.bold, fontSize: 9, letterSpacing: 0.8 },
  pressed: { opacity: 0.88, transform: [{ scale: 0.992 }] }
});
