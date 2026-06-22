import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";

export function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const { colors } = useTheme();
  const accentColor = accent || colors.borderStrong;
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View style={[styles.accentPill, { backgroundColor: accentColor }]} />
        <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.value, { color: accent || colors.text }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: "46%",
    minHeight: 92,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    overflow: "hidden"
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12
  },
  accentPill: {
    width: 28,
    height: 4,
    borderRadius: 999
  },
  label: {
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  value: {
    fontSize: 23,
    fontWeight: "900",
    minWidth: 0
  }
});
