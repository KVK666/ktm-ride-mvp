import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";

export function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const { colors } = useTheme();
  const accentColor = accent || colors.borderStrong;
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.accent, { backgroundColor: accentColor }]} />
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
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
    minHeight: 94,
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
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 10,
    textTransform: "uppercase"
  },
  value: {
    fontSize: 24,
    fontWeight: "900",
    minWidth: 0
  }
});
