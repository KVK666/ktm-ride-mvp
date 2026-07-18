import { Ionicons } from "@expo/vector-icons";
import { BottomTabBarButtonProps, createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ProfileAvatar } from "../components/ProfileAvatar";
import { useAuth } from "../context/AuthContext";
import { AnalyticsScreen } from "../screens/AnalyticsScreen";
import { DashboardScreen } from "../screens/DashboardScreen";
import { HistoryScreen } from "../screens/HistoryScreen";
import { NavigateScreen } from "../screens/NavigateScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { ReportsScreen } from "../screens/ReportsScreen";
import { RideDetailScreen } from "../screens/RideDetailScreen";
import { RideScreen } from "../screens/RideScreen";
import { SavedPlacesScreen } from "../screens/SavedPlacesScreen";
import { TripDetailScreen } from "../screens/TripDetailScreen";
import { TripsScreen } from "../screens/TripsScreen";
import { useTheme } from "../theme/ThemeContext";
import { typography } from "../theme/colors";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
  Home: "home",
  Plan: "map",
  Ride: "radio-button-on",
  Journal: "book",
  Insights: "analytics"
};

function AccountShortcut({ navigation }: { navigation: any }) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open account and settings"
      onPress={() => navigation.navigate("Account")}
      style={({ pressed }) => [styles.accountShortcut, { top: insets.top + 8, backgroundColor: colors.overlay, borderColor: colors.border }, pressed && styles.pressed]}
    >
      <ProfileAvatar user={user} size={36} radius={13} />
    </Pressable>
  );
}

function withAccount(ScreenComponent: React.ComponentType<any>) {
  return function TabScreen(props: any) {
    return (
      <View style={styles.flex}>
        <ScreenComponent {...props} />
        <AccountShortcut navigation={props.navigation} />
      </View>
    );
  };
}

const HomeTab = withAccount(DashboardScreen);
const PlanTab = withAccount(NavigateScreen);
const RideTab = withAccount(RideScreen);
const JournalTab = withAccount(HistoryScreen);
const InsightsTab = withAccount(AnalyticsScreen);

function RideTabButton(props: BottomTabBarButtonProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.rideButtonSlot}>
      <Pressable
        {...props}
        accessibilityLabel="Ride"
        style={({ pressed }) => [styles.rideButton, { backgroundColor: colors.accent, borderColor: colors.background }, pressed && styles.pressed]}
      >
        <Ionicons name="radio-button-on" size={25} color={colors.onAccent} />
        <Text style={[styles.rideLabel, { color: colors.onAccent }]}>Ride</Text>
      </Pressable>
    </View>
  );
}

function MainTabs() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: colors.overlay,
          borderTopColor: "transparent",
          height: 80,
          paddingTop: 8,
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
        tabBarLabelStyle: { fontSize: 10, fontFamily: typography.bold },
        tabBarIcon: ({ color, size }) => <Ionicons name={icons[route.name]} color={color} size={size} />
      })}
    >
      <Tab.Screen name="Home" component={HomeTab} />
      <Tab.Screen name="Plan" component={PlanTab} />
      <Tab.Screen name="Ride" component={RideTab} options={{ tabBarButton: (props) => <RideTabButton {...props} /> }} />
      <Tab.Screen name="Journal" component={JournalTab} />
      <Tab.Screen name="Insights" component={InsightsTab} />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  const { colors } = useTheme();
  const screenOptions = {
    headerStyle: { backgroundColor: colors.background },
    headerShadowVisible: false,
    headerTintColor: colors.text,
    headerTitleStyle: { fontFamily: typography.bold },
    contentStyle: { backgroundColor: colors.background }
  };
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen name="Account" component={ProfileScreen} options={{ title: "Account & settings" }} />
      <Stack.Screen name="RideDetail" component={RideDetailScreen} options={{ title: "Ride details" }} />
      <Stack.Screen name="Trips" component={TripsScreen} options={{ title: "Trip albums" }} />
      <Stack.Screen name="TripDetail" component={TripDetailScreen} options={{ title: "Trip album" }} />
      <Stack.Screen name="SavedPlaces" component={SavedPlacesScreen} options={{ title: "Saved places" }} />
      <Stack.Screen name="Reports" component={ReportsScreen} options={{ title: "Reports" }} />
      <Stack.Screen name="Navigate" component={NavigateScreen} options={{ title: "Plan" }} />
      <Stack.Screen name="Analytics" component={AnalyticsScreen} options={{ title: "Insights" }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: "Account & settings" }} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  accountShortcut: { position: "absolute", right: 16, zIndex: 20, width: 44, height: 44, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  rideButtonSlot: { flex: 1, alignItems: "center" },
  rideButton: { width: 58, height: 58, marginTop: -15, borderRadius: 23, borderWidth: 4, alignItems: "center", justifyContent: "center", elevation: 7 },
  rideLabel: { fontFamily: typography.extraBold, fontSize: 9, marginTop: 1 },
  pressed: { opacity: 0.88, transform: [{ scale: 0.96 }] }
});
