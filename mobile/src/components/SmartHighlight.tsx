import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { typography } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { JournalHighlight } from "../types";

export function SmartHighlight({ highlight, onPress }: { highlight: JournalHighlight; onPress?: () => void }) {
  const { colors } = useTheme();
  const icon = safeIcon(highlight.icon);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.surfaceHigh },
        pressed && styles.pressed
      ]}
    >
      <View style={[styles.icon, { backgroundColor: `${colors.blue}18` }]}>
        <Ionicons name={icon} color={colors.blue} size={20} />
      </View>
      <View style={styles.text}>
        <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>{highlight.title}</Text>
        <Text numberOfLines={2} style={[styles.body, { color: colors.muted }]}>{highlight.body}</Text>
      </View>
      {onPress ? <Ionicons name="chevron-forward" color={colors.muted} size={18} /> : null}
    </Pressable>
  );
}

function safeIcon(icon?: string): keyof typeof Ionicons.glyphMap {
  const name = icon || "sparkles";
  return Object.prototype.hasOwnProperty.call(Ionicons.glyphMap, name) ? name as keyof typeof Ionicons.glyphMap : "sparkles";
}

const styles = StyleSheet.create({
  card: { minWidth: 236, maxWidth: 280, borderRadius: 24, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 42, height: 42, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, minWidth: 0 },
  title: { fontFamily: typography.extraBold, fontSize: 14 },
  body: { fontFamily: typography.regular, fontSize: 12, lineHeight: 17, marginTop: 3 },
  pressed: { opacity: 0.84, transform: [{ scale: 0.99 }] }
});
