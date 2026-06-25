import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { typography } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";

export function RideBadge({ label, tone = "neutral" }: { label: string; tone?: "accent" | "blue" | "neutral" }) {
  const { colors } = useTheme();
  const background = tone === "accent" ? `${colors.accent}1F` : tone === "blue" ? `${colors.blue}1F` : colors.surfaceHigh;
  const color = tone === "accent" ? colors.accent : tone === "blue" ? colors.blue : colors.textSoft;

  return (
    <View style={[styles.badge, { backgroundColor: background }]}>
      <Text numberOfLines={1} style={[styles.text, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minHeight: 26,
    maxWidth: 150,
    borderRadius: 999,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  text: {
    fontFamily: typography.bold,
    fontSize: 9,
    letterSpacing: 0.75,
    textTransform: "uppercase"
  }
});
