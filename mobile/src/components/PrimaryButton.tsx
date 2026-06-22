import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { useTheme } from "../theme/ThemeContext";

type Props = {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  danger?: boolean;
  compact?: boolean;
  block?: boolean;
};

export function PrimaryButton({ label, icon, onPress, disabled, loading, danger, compact, block }: Props) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        block && styles.buttonBlock,
        { backgroundColor: danger ? colors.danger : colors.accent },
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={compact ? 16 : 18} color={danger ? colors.text : colors.onAccent} /> : null}
          <Text style={[styles.label, compact && styles.labelCompact, { color: danger ? colors.text : colors.onAccent }]}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 38,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
    maxWidth: "100%",
    gap: 7,
    paddingHorizontal: 12,
    borderColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 2
  },
  buttonCompact: {
    minHeight: 34,
    borderRadius: 10,
    gap: 6,
    paddingHorizontal: 10
  },
  buttonBlock: {
    alignSelf: "stretch"
  },
  disabled: {
    opacity: 0.6
  },
  pressed: {
    transform: [{ scale: 0.975 }],
    opacity: 0.92
  },
  label: {
    fontSize: 13,
    fontWeight: "900"
  },
  labelCompact: {
    fontSize: 12
  }
});
