import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Screen } from "../components/Screen";
import { useAuth } from "../context/AuthContext";
import { typography } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";

const destinations = [
  { route: "Analytics", icon: "analytics" as const, eyebrow: "PERFORMANCE", title: "Insights", description: "Patterns hiding inside every kilometre" },
  { route: "Reports", icon: "document-text" as const, eyebrow: "EXPORT", title: "Ride reports", description: "Clean summaries ready to save or share" },
  { route: "Profile", icon: "settings" as const, eyebrow: "RIDER", title: "Profile & settings", description: "Motorcycle, appearance, tracking and diagnostics" }
];

export function MoreScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const { user } = useAuth();
  const displayName = user?.name?.trim() || "Rider";

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>YOUR RIDEPULSE</Text>
          <Text style={[styles.title, { color: colors.text }]}>You</Text>
        </View>
        <Pressable onPress={() => navigation.navigate("Profile")} style={[styles.identity, { backgroundColor: colors.surfaceHigh }]}>
          <View style={[styles.avatar, { backgroundColor: colors.accent }]}><Text style={[styles.avatarText, { color: colors.onAccent }]}>{displayName.charAt(0).toUpperCase()}</Text></View>
          <View style={styles.flex}><Text style={[styles.name, { color: colors.text }]}>{displayName}</Text><Text style={[styles.bike, { color: colors.muted }]}>{user?.bikeModel || "Motorcycle"}</Text></View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>
        <View style={styles.menu}>
          {destinations.map((item) => (
            <Pressable key={item.route} onPress={() => navigation.navigate(item.route)} style={({ pressed }) => [styles.card, { backgroundColor: colors.surface }, pressed && styles.pressed]}>
              <View style={styles.cardTop}><View style={[styles.icon, { backgroundColor: `${colors.accent}15` }]}><Ionicons name={item.icon} size={23} color={colors.accent} /></View><Ionicons name="arrow-up-outline" size={19} color={colors.muted} style={styles.arrow} /></View>
              <Text style={[styles.cardEyebrow, { color: colors.muted }]}>{item.eyebrow}</Text>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{item.title}</Text>
              <Text style={[styles.cardCopy, { color: colors.muted }]}>{item.description}</Text>
            </Pressable>
          ))}
        </View>
        <View style={[styles.note, { backgroundColor: `${colors.blue}12` }]}><Ionicons name="shield-checkmark" color={colors.blue} size={20} /><Text style={[styles.noteText, { color: colors.muted }]}>Your profile photos and imported ride photos stay on this phone.</Text></View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 118, gap: 20 }, header: { gap: 3, paddingTop: 2 }, eyebrow: { fontFamily: typography.bold, fontSize: 10, letterSpacing: 1.35 }, title: { fontFamily: typography.extraBold, fontSize: 36 },
  identity: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 26 }, avatar: { width: 54, height: 54, borderRadius: 19, alignItems: "center", justifyContent: "center" }, avatarText: { fontFamily: typography.extraBold, fontSize: 20 }, flex: { flex: 1 }, name: { fontFamily: typography.extraBold, fontSize: 18 }, bike: { fontFamily: typography.medium, marginTop: 3, fontSize: 12 },
  menu: { gap: 14 }, card: { minHeight: 164, borderRadius: 26, padding: 18 }, cardTop: { flexDirection: "row", justifyContent: "space-between" }, icon: { width: 46, height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center" }, arrow: { transform: [{ rotate: "45deg" }] }, cardEyebrow: { fontFamily: typography.bold, fontSize: 9, letterSpacing: 1.2, marginTop: 17 }, cardTitle: { fontFamily: typography.extraBold, fontSize: 21, marginTop: 2 }, cardCopy: { fontFamily: typography.regular, fontSize: 13, lineHeight: 19, marginTop: 5 },
  note: { flexDirection: "row", gap: 11, borderRadius: 20, padding: 15 }, noteText: { flex: 1, fontFamily: typography.regular, fontSize: 12, lineHeight: 18 }, pressed: { opacity: 0.86, transform: [{ scale: 0.993 }] }
});
