import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Screen } from "../components/Screen";
import { useAuth } from "../context/AuthContext";
import { ThemeColors } from "../theme/colors";
import { useTheme, useThemedStyles } from "../theme/ThemeContext";

const destinations: Array<{
  route: "Analytics" | "Reports" | "Profile";
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}> = [
  { route: "Analytics", icon: "analytics", title: "Analytics", description: "Explore distance, duration, and speed trends" },
  { route: "Reports", icon: "document-text", title: "Reports", description: "Create and export ride summaries" },
  { route: "Profile", icon: "person-circle", title: "Profile & settings", description: "Manage your rider, motorcycle, theme, and diagnostics" }
];

export function MoreScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { user } = useAuth();
  const displayName = user?.name?.trim() || "Rider";

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Your RidePulse</Text>
          <Text style={styles.title}>More</Text>
          <Text style={styles.subtitle}>Insights, exports, and rider settings in one clean place.</Text>
        </View>

        <View style={styles.riderCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.riderText}>
            <Text style={styles.riderName}>{displayName}</Text>
            <Text style={styles.motorcycle}>{user?.bikeModel || "Motorcycle"}</Text>
          </View>
          <Ionicons name="shield-checkmark" size={22} color={colors.success} />
        </View>

        <View style={styles.menu}>
          {destinations.map((item) => (
            <Pressable
              key={item.route}
              accessibilityRole="button"
              onPress={() => navigation.navigate(item.route)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.iconShell}>
                <Ionicons name={item.icon} size={23} color={colors.accent} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.rowDescription}>{item.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => ({
  content: { padding: 16, paddingBottom: 110, gap: 16 },
  header: { gap: 5, paddingTop: 4 },
  kicker: { color: colors.accent, fontSize: 12, fontWeight: "900", textTransform: "uppercase" as const },
  title: { color: colors.text, fontSize: 28, lineHeight: 32, fontWeight: "900" },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20, maxWidth: 340 },
  riderCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.surfaceHigh,
    borderColor: colors.border,
    borderWidth: 1
  },
  avatar: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.accent, alignItems: "center" as const, justifyContent: "center" as const },
  avatarText: { color: colors.onAccent, fontSize: 18, fontWeight: "900" },
  riderText: { flex: 1, minWidth: 0 },
  riderName: { color: colors.text, fontSize: 15, fontWeight: "900" },
  motorcycle: { color: colors.muted, marginTop: 2, fontSize: 13 },
  menu: { gap: 12 },
  row: {
    minHeight: 74,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    padding: 12
  },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  iconShell: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.surfaceHigh, alignItems: "center" as const, justifyContent: "center" as const },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  rowDescription: { color: colors.muted, marginTop: 3, lineHeight: 17, fontSize: 13 },
});
