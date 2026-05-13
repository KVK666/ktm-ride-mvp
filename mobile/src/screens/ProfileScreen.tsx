import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme/colors";

type ProfileRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
};

function initialsFor(name?: string | null) {
  const parts = (name || "Rider")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "R";
}

function ProfileRow({ icon, label, value }: ProfileRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} color={colors.orange} size={20} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    </View>
  );
}

export function ProfileScreen() {
  const { user, logout } = useAuth();
  const displayName = user?.name?.trim() || "Rider";
  const bikeModel = user?.bikeModel || "KTM Duke 250 Gen 3";
  const riderId = user?.id ? user.id.slice(0, 8).toUpperCase() : "Not available";

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initialsFor(displayName)}</Text>
          </View>
          <View style={styles.heroText}>
            <Text style={styles.kicker}>Rider profile</Text>
            <Text style={styles.title}>{displayName}</Text>
            <Text style={styles.subtitle}>{bikeModel}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <ProfileRow icon="person" label="Name" value={displayName} />
          <ProfileRow icon="mail" label="Email" value={user?.email || "Not available"} />
          <ProfileRow icon="speedometer" label="Bike" value={bikeModel} />
          <ProfileRow icon="finger-print" label="Rider ID" value={riderId} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Account</Text>
          <Text style={styles.cardCopy}>
            Your rides, reports, dashboard stats, and route history are saved to this rider account.
          </Text>
        </View>

        <PrimaryButton label="Logout" icon="exit" danger onPress={logout} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 16
  },
  hero: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14
  },
  avatar: {
    width: 70,
    height: 70,
    borderRadius: 8,
    backgroundColor: colors.orange,
    alignItems: "center",
    justifyContent: "center"
  },
  avatarText: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "900"
  },
  heroText: {
    flex: 1
  },
  kicker: {
    color: colors.orangeSoft,
    fontWeight: "900",
    fontSize: 12,
    marginBottom: 4
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900"
  },
  subtitle: {
    color: colors.muted,
    marginTop: 4,
    fontSize: 14
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    gap: 12
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: colors.surfaceHigh,
    alignItems: "center",
    justifyContent: "center"
  },
  rowText: {
    flex: 1
  },
  rowLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700"
  },
  rowValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 2
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  cardCopy: {
    color: colors.muted,
    lineHeight: 20
  }
});
