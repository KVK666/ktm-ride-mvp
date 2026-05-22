import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { LoginScreen } from "../screens/LoginScreen";
import { useTheme } from "../theme/ThemeContext";

const Stack = createNativeStackNavigator();

export function AuthStack() {
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background }
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
}
