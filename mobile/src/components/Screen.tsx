import React from "react";
import { SafeAreaView, StatusBar, StyleSheet, ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeContext";

export function Screen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { colors } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }, style]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  }
});
