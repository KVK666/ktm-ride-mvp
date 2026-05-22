import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { AnalyticsScreen } from "../screens/AnalyticsScreen";
import { DashboardScreen } from "../screens/DashboardScreen";
import { HistoryScreen } from "../screens/HistoryScreen";
import { NavigateScreen } from "../screens/NavigateScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { ReportsScreen } from "../screens/ReportsScreen";
import { RideDetailScreen } from "../screens/RideDetailScreen";
import { RideScreen } from "../screens/RideScreen";
import { useTheme } from "../theme/ThemeContext";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
  Dashboard: "speedometer",
  Navigate: "navigate",
  Ride: "radio-button-on",
  History: "time",
  Analytics: "analytics",
  Reports: "document-text",
  Profile: "person-circle"
};

function MainTabs() {
  const { colors } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTintColor: colors.text,
        tabBarStyle: {
          backgroundColor: colors.overlay,
          borderTopColor: colors.border,
          height: 72,
          paddingTop: 8,
          paddingBottom: 10
        },
        tabBarActiveTintColor: colors.orange,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "800" },
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

export function AppNavigator() {
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: "900" },
        contentStyle: { backgroundColor: colors.background }
      }}
    >
      <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen name="RideDetail" component={RideDetailScreen} options={{ title: "Ride detail" }} />
    </Stack.Navigator>
  );
}
