import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { typography } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";

export function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.metric}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.value, { color: accent ? colors.accent : colors.text }]}>{value}</Text>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  metric: { flex: 1, minWidth: 0 },
  value: { fontFamily: typography.extraBold, fontSize: 23 },
  label: { fontFamily: typography.medium, fontSize: 11, marginTop: 3 }
});
