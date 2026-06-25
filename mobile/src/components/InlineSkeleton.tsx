import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";

export function InlineSkeleton({ height = 18, width = "100%" }: { height?: number; width?: number | `${number}%` }) {
  const { colors } = useTheme();
  return <View style={[styles.skeleton, { height, width, backgroundColor: colors.surfaceHigh }]} />;
}

const styles = StyleSheet.create({
  skeleton: {
    borderRadius: 999,
    opacity: 0.78
  }
});
