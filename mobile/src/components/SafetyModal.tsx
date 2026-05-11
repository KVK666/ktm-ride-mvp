import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

export function SafetyModal({
  visible,
  onAccept
}: {
  visible: boolean;
  onAccept: () => void;
}) {
  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>Ride safely</Text>
          <Text style={styles.message}>
            Set your destination before riding. Do not interact with the phone while riding.
          </Text>
          <Pressable style={styles.button} onPress={onAccept}>
            <Text style={styles.buttonText}>I understand</Text>
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
    backgroundColor: colors.surfaceHigh,
    borderColor: colors.orange,
    borderWidth: 1,
    borderRadius: 8,
    padding: 22
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 10
  },
  message: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 18
  },
  button: {
    backgroundColor: colors.orange,
    minHeight: 52,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  buttonText: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 16
  }
});
