import { Ionicons } from "@expo/vector-icons";
import { BottomTabBarButtonProps, createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { DashboardScreen } from "../screens/DashboardScreen";
import { HistoryScreen } from "../screens/HistoryScreen";
import { MoreScreen } from "../screens/MoreScreen";
import { NavigateScreen } from "../screens/NavigateScreen";
import { AnalyticsScreen } from "../screens/AnalyticsScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { ReportsScreen } from "../screens/ReportsScreen";
import { RideDetailScreen } from "../screens/RideDetailScreen";
import { RideScreen } from "../screens/RideScreen";
import { useTheme } from "../theme/ThemeContext";
import { typography } from "../theme/colors";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const MoreStack = createNativeStackNavigator();

const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
  Dashboard: "home",
  Navigate: "navigate",
  Ride: "radio-button-on",
  History: "time",
  More: "person-circle"
};

function MoreNavigator() {
  const { colors } = useTheme();

  return (
    <MoreStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: typography.bold },
        contentStyle: { backgroundColor: colors.background }
      }}
    >
      <MoreStack.Screen name="MoreHome" component={MoreScreen} options={{ headerShown: false }} />
      <MoreStack.Screen name="Analytics" component={AnalyticsScreen} />
      <MoreStack.Screen name="Reports" component={ReportsScreen} />
      <MoreStack.Screen name="Profile" component={ProfileScreen} options={{ title: "Profile & settings" }} />
    </MoreStack.Navigator>
  );
}

function RideTabButton(props: BottomTabBarButtonProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.rideButtonSlot}>
      <Pressable
        {...props}
        accessibilityLabel="Ride"
        style={({ pressed }) => [
          styles.rideButton,
          { backgroundColor: colors.accent, borderColor: colors.background },
          pressed && styles.rideButtonPressed
        ]}
      >
        <Ionicons name="radio-button-on" size={28} color={colors.onAccent} />
      </Pressable>
    </View>
  );
}

function MainTabs() {
  const { colors } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: colors.overlay,
          borderTopColor: "transparent",
          height: 76,
          paddingTop: 9,
          paddingBottom: 10,
          position: "absolute",
          left: 12,
          right: 12,
          bottom: 10,
          borderRadius: 25,
          elevation: 12
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 9, fontFamily: typography.bold },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={icons[route.name]} color={color} size={size} />
        )
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: "Home" }} />
      <Tab.Screen name="Navigate" component={NavigateScreen} />
      <Tab.Screen
        name="Ride"
        component={RideScreen}
        options={{ tabBarButton: (props) => <RideTabButton {...props} />, tabBarLabel: "Ride" }}
      />
      <Tab.Screen name="History" component={HistoryScreen} options={{ title: "Journal" }} />
      <Tab.Screen name="More" component={MoreNavigator} options={{ headerShown: false, title: "You" }} />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: typography.bold },
        contentStyle: { backgroundColor: colors.background }
      }}
    >
      <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen name="RideDetail" component={RideDetailScreen} options={{ title: "Ride details" }} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  rideButtonSlot: {
    flex: 1,
    alignItems: "center"
  },
  rideButton: {
    width: 52,
    height: 52,
    marginTop: -16,
    borderRadius: 26,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#C8FF5A",
    shadowOpacity: 0.24,
    shadowRadius: 14,
    elevation: 7
  },
  rideButtonPressed: {
    transform: [{ scale: 0.94 }]
  }
});
