import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

export function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const accentColor = accent || colors.borderStrong;
  return (
    <View style={styles.card}>
      <View style={[styles.accent, { backgroundColor: accentColor }]} />
      <Text style={styles.label}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.value, accent ? { color: accent } : null]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: "46%",
    minHeight: 94,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    overflow: "hidden"
  },
  accent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3
  },
  label: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 10,
    textTransform: "uppercase"
  },
  value: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    minWidth: 0
  }
});
