import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import React from "react";
import { AnalyticsScreen } from "../screens/AnalyticsScreen";
import { DashboardScreen } from "../screens/DashboardScreen";
import { HistoryScreen } from "../screens/HistoryScreen";
import { NavigateScreen } from "../screens/NavigateScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { ReportsScreen } from "../screens/ReportsScreen";
import { RideScreen } from "../screens/RideScreen";
import { colors } from "../theme/colors";

const Tab = createBottomTabNavigator();

const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
  Dashboard: "speedometer",
  Navigate: "navigate",
  Ride: "radio-button-on",
  History: "time",
  Analytics: "analytics",
  Reports: "document-text",
  Profile: "person-circle"
};

export function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 68,
          paddingTop: 8,
          paddingBottom: 8
        },
        tabBarActiveTintColor: colors.orange,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 10 },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={icons[route.name]} color={color} size={size} />
        )
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Navigate" component={NavigateScreen} />
      <Tab.Screen name="Ride" component={RideScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Analytics" component={AnalyticsScreen} />
      <Tab.Screen name="Reports" component={ReportsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
