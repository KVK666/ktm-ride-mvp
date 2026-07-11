import { Ionicons } from "@expo/vector-icons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../api/client";
import { Metric } from "../components/Metric";
import { OnboardingScreen } from "../components/OnboardingScreen";
import { ProfileAvatar } from "../components/ProfileAvatar";
import { Screen } from "../components/Screen";
import { useAuth } from "../context/AuthContext";
import { typography } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { JournalResponse } from "../types";
import { km } from "../utils/format";

const destinations = [
  { route: "Analytics", icon: "analytics" as const, eyebrow: "PERFORMANCE", title: "Insights", description: "Patterns hiding inside every kilometre" },
  { route: "Reports", icon: "document-text" as const, eyebrow: "EXPORT", title: "Ride reports", description: "Clean summaries ready to save or share" },
  { route: "Profile", icon: "settings" as const, eyebrow: "RIDER", title: "Profile & settings", description: "Motorcycle, appearance, tracking and diagnostics" }
];

export function MoreScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const floatingTabClearance = Math.max(bottomTabBarHeight, 96) + 56;
  const { user } = useAuth();
  const displayName = user?.name?.trim() || "Rider";
  const [journal, setJournal] = useState<JournalResponse | null>(null);
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      api<JournalResponse>("/journal")
        .then((response) => {
          if (active) setJournal(response);
        })
        .catch(() => {
          if (active) setJournal(null);
        });
      return () => {
        active = false;
      };
    }, [])
  );

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: floatingTabClearance }]}
      >
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>YOUR RIDEPULSE</Text>
          <Text style={[styles.title, { color: colors.text }]}>You</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Open profile and settings" onPress={() => navigation.navigate("Profile")} style={[styles.identity, { backgroundColor: colors.surfaceHigh }]}>
          <ProfileAvatar user={user} size={58} radius={21} />
          <View style={styles.flex}><Text style={[styles.name, { color: colors.text }]}>{displayName}</Text><Text style={[styles.bike, { color: colors.muted }]}>{user?.bikeModel || "Motorcycle"}</Text></View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>
        <View style={[styles.smartStats, { backgroundColor: colors.surface }]}>
          <View style={styles.smartStatsHeader}>
            <Text style={[styles.smartStatsTitle, { color: colors.text }]}>Rider pulse</Text>
            <Text style={[styles.smartStatsMeta, { color: colors.muted }]}>From your smart journal</Text>
          </View>
          <View style={styles.metricRow}>
            <Metric label="MONTH" value={km(journal?.stats?.monthDistanceM || 0)} accent />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Metric label="RIDES" value={String(journal?.stats?.totalRides || 0)} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Metric label="TO REVIEW" value={String(journal?.unreviewedCount || 0)} />
          </View>
        </View>
        <View style={styles.menu}>
          {destinations.map((item) => (
            <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.title}`} key={item.route} onPress={() => navigation.navigate(item.route)} style={({ pressed }) => [styles.card, { backgroundColor: colors.surface }, pressed && styles.pressed]}>
              <View style={styles.cardTop}><View style={[styles.icon, { backgroundColor: `${colors.accent}15` }]}><Ionicons name={item.icon} size={23} color={colors.accent} /></View><Ionicons name="arrow-up-outline" size={19} color={colors.muted} style={styles.arrow} /></View>
              <Text style={[styles.cardEyebrow, { color: colors.muted }]}>{item.eyebrow}</Text>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{item.title}</Text>
              <Text style={[styles.cardCopy, { color: colors.muted }]}>{item.description}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Replay walkthrough" onPress={() => setWalkthroughOpen(true)} style={({ pressed }) => [styles.walkthrough, { backgroundColor: colors.elevated }, pressed && styles.pressed]}>
          <View style={[styles.icon, { backgroundColor: `${colors.blue}18` }]}><Ionicons name="sparkles" size={23} color={colors.blue} /></View>
          <View style={styles.flex}>
            <Text style={[styles.cardEyebrow, { color: colors.muted, marginTop: 0 }]}>GUIDE</Text>
            <Text style={[styles.walkthroughTitle, { color: colors.text }]}>Replay walkthrough</Text>
            <Text style={[styles.cardCopy, { color: colors.muted }]}>See the quick tour for tracking, albums, memories, and privacy.</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>
        <View style={[styles.note, { backgroundColor: `${colors.blue}12` }]}><Ionicons name="shield-checkmark" color={colors.blue} size={20} /><Text style={[styles.noteText, { color: colors.muted }]}>Your display photo syncs with your RidePulse account. Imported ride albums still stay private on this phone.</Text></View>
      </ScrollView>
      <Modal visible={walkthroughOpen} animationType="slide" onRequestClose={() => setWalkthroughOpen(false)}>
        <OnboardingScreen onDone={() => setWalkthroughOpen(false)} onSkip={() => setWalkthroughOpen(false)} />
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 20 }, header: { gap: 3, paddingTop: 2 }, eyebrow: { fontFamily: typography.bold, fontSize: 10, letterSpacing: 1.35 }, title: { fontFamily: typography.extraBold, fontSize: 36 },
  identity: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 26 }, flex: { flex: 1 }, name: { fontFamily: typography.extraBold, fontSize: 18 }, bike: { fontFamily: typography.medium, marginTop: 3, fontSize: 12 },
  smartStats: { borderRadius: 26, padding: 17, gap: 12 },
  smartStatsHeader: { gap: 2 },
  smartStatsTitle: { fontFamily: typography.extraBold, fontSize: 20 },
  smartStatsMeta: { fontFamily: typography.medium, fontSize: 12 },
  metricRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  divider: { width: 1, height: 42 },
  menu: { gap: 14 }, card: { minHeight: 164, borderRadius: 26, padding: 18 }, cardTop: { flexDirection: "row", justifyContent: "space-between" }, icon: { width: 46, height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center" }, arrow: { transform: [{ rotate: "45deg" }] }, cardEyebrow: { fontFamily: typography.bold, fontSize: 9, letterSpacing: 1.2, marginTop: 17 }, cardTitle: { fontFamily: typography.extraBold, fontSize: 21, marginTop: 2 }, cardCopy: { fontFamily: typography.regular, fontSize: 13, lineHeight: 19, marginTop: 5 },
  walkthrough: { flexDirection: "row", alignItems: "center", gap: 13, borderRadius: 24, padding: 16 },
  walkthroughTitle: { fontFamily: typography.extraBold, fontSize: 18, marginTop: 2 },
  note: { flexDirection: "row", gap: 11, borderRadius: 20, padding: 15 }, noteText: { flex: 1, fontFamily: typography.regular, fontSize: 12, lineHeight: 18 }, pressed: { opacity: 0.86, transform: [{ scale: 0.993 }] }
});
