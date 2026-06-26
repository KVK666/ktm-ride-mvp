import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { typography } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";

export function PremiumEmptyState({
  icon = "trail-sign-outline",
  title,
  body,
  actionLabel,
  onAction
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={[styles.glow, { backgroundColor: `${colors.accent}12` }]} />
      <View style={[styles.icon, { backgroundColor: `${colors.accent}18` }]}>
        <Ionicons name={icon} color={colors.accent} size={28} />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.body, { color: colors.muted }]}>{body}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} style={[styles.action, { backgroundColor: colors.accent }]}>
          <Text style={[styles.actionText, { color: colors.onAccent }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 30, padding: 24, gap: 10, overflow: "hidden" },
  glow: { position: "absolute", width: 170, height: 170, borderRadius: 85, right: -58, top: -72 },
  icon: { width: 52, height: 52, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: typography.extraBold, fontSize: 22, lineHeight: 28, marginTop: 4 },
  body: { fontFamily: typography.regular, fontSize: 13, lineHeight: 20 },
  action: { alignSelf: "flex-start", minHeight: 44, borderRadius: 16, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", marginTop: 8 },
  actionText: { fontFamily: typography.bold, fontSize: 13 }
});
