import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, StatusBar, StyleSheet, View, ViewStyle } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
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
        <LinearGradient
          colors={[`${colors.blue}18`, "transparent", `${colors.accent}0B`]}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
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
  }
});
