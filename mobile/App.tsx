import "./src/services/locationTask";

import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { AuthStack } from "./src/navigation/AuthStack";
import { colors } from "./src/theme/colors";

const navTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.orange
  }
};

function Root() {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.orange} size="large" />
        <Text style={styles.loadingText}>Starting Duke Ride</Text>
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
    backgroundColor: colors.background,
    gap: 14
  },
  loadingText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800"
  }
});

export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Root />
    </AuthProvider>
  );
}
