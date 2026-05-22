import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";

export function SafetyModal({
  visible,
  onAccept
}: {
  visible: boolean;
  onAccept: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.modal, { backgroundColor: colors.surfaceHigh, borderColor: colors.orange }]}>
          <Text style={[styles.title, { color: colors.text }]}>Ride safely</Text>
          <Text style={[styles.message, { color: colors.text }]}>
            Set your destination before riding. Do not interact with the phone while riding.
          </Text>
          <Pressable style={[styles.button, { backgroundColor: colors.orange }]} onPress={onAccept}>
            <Text style={[styles.buttonText, { color: colors.text }]}>I understand</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24
  },
  modal: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 8,
    padding: 22
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 10
  },
  message: {
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 18
  },
  button: {
    minHeight: 52,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  buttonText: {
    fontWeight: "800",
    fontSize: 16
  }
});
