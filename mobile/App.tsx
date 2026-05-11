import "./src/services/locationTask";

import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import React from "react";
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
    return null;
  }

  return (
    <NavigationContainer theme={navTheme}>
      {token ? <AppNavigator /> : <AuthStack />}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Root />
    </AuthProvider>
  );
}
