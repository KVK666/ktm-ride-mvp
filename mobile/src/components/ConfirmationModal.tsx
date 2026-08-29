import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { typography } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

type Props = {
  visible: boolean;
  title: string;
  message: string;
  detail?: string;
  confirmLabel: string;
  confirmIcon?: IconName;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function ConfirmationModal({
  visible,
  title,
  message,
  detail,
  confirmLabel,
  confirmIcon = "checkmark",
  danger = false,
  loading = false,
  onConfirm,
  onClose
}: Props) {
  const { colors } = useTheme();
  const accent = danger ? colors.danger : colors.accent;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => { if (!loading) onClose(); }}
    >
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close confirmation" disabled={loading} onPress={onClose} style={StyleSheet.absoluteFillObject} />
        <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.handle} />
          <View style={[styles.icon, { backgroundColor: `${accent}18` }]}>
            <Ionicons name={danger ? "trash" : "cloud-upload"} color={accent} size={24} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.message, { color: colors.muted }]}>{message}</Text>
          {detail ? (
            <View style={[styles.detail, { borderColor: colors.border }]}>
              <Ionicons name="information-circle-outline" color={colors.muted} size={18} />
              <Text style={[styles.detailText, { color: colors.text }]}>{detail}</Text>
            </View>
          ) : null}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={loading}
              onPress={onClose}
              style={({ pressed }) => [styles.button, { borderColor: colors.border, backgroundColor: colors.surfaceHigh }, pressed && styles.pressed, loading && styles.disabled]}
            >
              <Text style={[styles.buttonText, { color: colors.text }]}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: loading }}
              disabled={loading}
              onPress={onConfirm}
              style={({ pressed }) => [styles.button, { backgroundColor: accent }, pressed && styles.pressed, loading && styles.disabled]}
            >
              {loading ? <ActivityIndicator color={colors.onAccent} /> : <Ionicons name={confirmIcon} color={colors.onAccent} size={18} />}
              <Text style={[styles.buttonText, { color: colors.onAccent }]}>{loading ? "Please wait..." : confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.68)" },
  sheet: { borderWidth: 1, borderBottomWidth: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 30, alignItems: "center", gap: 11 },
  handle: { width: 42, height: 4, borderRadius: 2, backgroundColor: "rgba(128,128,128,0.48)", marginBottom: 5 },
  icon: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: typography.extraBold, fontSize: 22, textAlign: "center" },
  message: { fontFamily: typography.regular, fontSize: 14, lineHeight: 21, textAlign: "center", maxWidth: 420 },
  detail: { width: "100%", minHeight: 48, borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: 9 },
  detailText: { flex: 1, fontFamily: typography.medium, fontSize: 12, lineHeight: 18 },
  actions: { width: "100%", flexDirection: "row", gap: 10, marginTop: 4 },
  button: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: "transparent", borderRadius: 16, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  buttonText: { fontFamily: typography.bold, fontSize: 13, textAlign: "center" },
  pressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.62 }
});
