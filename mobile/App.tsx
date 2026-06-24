import "./src/services/locationTask";

import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts
} from "@expo-google-fonts/manrope";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { AppErrorBoundary } from "./src/components/AppErrorBoundary";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { AuthStack } from "./src/navigation/AuthStack";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";

function Root() {
  const { token, loading } = useAuth();
  const { colors } = useTheme();
  const navTheme = {
    ...DefaultTheme,
    dark: true,
    colors: {
      ...DefaultTheme.colors,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      primary: colors.accent
    }
  };

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={[styles.loadingText, { color: colors.text }]}>Starting RidePulse</Text>
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      {token ? <AppNavigator /> : <AuthStack />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14
  },
  loadingText: {
    fontSize: 16,
    fontWeight: "800"
  }
});

export default function App() {
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <AppErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <Root />
        </AuthProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  );
}
