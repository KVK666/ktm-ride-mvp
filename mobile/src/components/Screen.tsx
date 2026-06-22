import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, StatusBar, StyleSheet, View, ViewStyle } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeContext";
import { motion } from "../theme/colors";

export function Screen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: reduceMotion ? 0 : motion.standard,
      useNativeDriver: true
    }).start();
  }, [opacity, reduceMotion]);

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={[styles.container, { backgroundColor: colors.background, paddingTop: Math.max(insets.top, 8) }, style]}
    >
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <View pointerEvents="none" style={styles.backdrop}>
        <View style={[styles.orbPrimary, { backgroundColor: colors.accent }]} />
        <View style={[styles.orbSecondary, { backgroundColor: colors.blue }]} />
        <View style={[styles.beam, { backgroundColor: colors.surfaceHigh }]} />
      </View>
      <Animated.View style={[styles.container, { opacity }]}>{children}</Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden"
  },
  orbPrimary: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    top: -90,
    right: -70,
    opacity: 0.1
  },
  orbSecondary: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    bottom: 120,
    left: -100,
    opacity: 0.08
  },
  beam: {
    position: "absolute",
    width: 420,
    height: 180,
    borderRadius: 90,
    top: 180,
    right: -140,
    opacity: 0.22,
    transform: [{ rotate: "-18deg" }]
  }
});
