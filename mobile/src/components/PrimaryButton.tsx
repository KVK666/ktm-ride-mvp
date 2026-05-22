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
};

export function PrimaryButton({ label, icon, onPress, disabled, loading, danger }: Props) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: danger ? colors.danger : colors.orange },
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={22} color={colors.text} /> : null}
          <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 54,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 18,
    borderColor: "rgba(255,255,255,0.12)",
    borderWidth: 1
  },
  disabled: {
    opacity: 0.6
  },
  pressed: {
    transform: [{ scale: 0.99 }]
  },
  label: {
    fontSize: 16,
    fontWeight: "900"
  }
});
