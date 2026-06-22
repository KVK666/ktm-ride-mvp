import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { api } from "../api/client";
import { Screen } from "../components/Screen";
import { ThemeColors } from "../theme/colors";
import { useTheme, useThemedStyles } from "../theme/ThemeContext";
import { Ride } from "../types";
import { duration, km, kmh, shortDate, time } from "../utils/format";

type Period = "today" | "month" | "year";

export function HistoryScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<any>();
  const [period, setPeriod] = useState<Period>("month");
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await api<{ rides: Ride[] }>(`/rides?period=${period}`);
      setRides(Array.isArray(response.rides) ? response.rides : []);
    } catch (err: any) {
      setError(err.message || "Ride history unavailable");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Your journeys</Text>
          <Text style={styles.title}>Ride history</Text>
          <Text style={styles.subtitle}>Every route, ready to revisit.</Text>
        </View>
        <View style={styles.tabs}>
          {(["today", "month", "year"] as Period[]).map((item) => (
            <Pressable
              key={item}
              onPress={() => setPeriod(item)}
              style={[styles.tab, period === item && styles.activeTab]}
            >
              <Text style={[styles.tabText, period === item && styles.activeTabText]}>{item}</Text>
            </Pressable>
          ))}
        </View>

        {loading ? <ActivityIndicator color={colors.accent} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {rides.map((ride) => (
          <Pressable
            key={ride.id}
            onPress={() => navigation.navigate("RideDetail", { rideId: ride.id, reviewMode: !ride.reviewedAt })}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <View style={styles.cardHeader}>
              <View style={styles.routeText}>
                <Text numberOfLines={2} style={styles.route}>{rideTitle(ride)}</Text>
                <Text numberOfLines={1} style={styles.meta}>{shortDate(ride.startedAt)} - {time(ride.startedAt)}</Text>
              </View>
              <Text numberOfLines={1} adjustsFontSizeToFit style={styles.distance}>{km(ride.distanceM)}</Text>
            </View>
            <View style={styles.row}>
              <Text numberOfLines={1} style={styles.metric}>Duration {duration(ride.durationS)}</Text>
              <Text numberOfLines={1} style={styles.metric}>Top {kmh(ride.topSpeedKmh)}</Text>
              <Text numberOfLines={1} style={styles.metric}>Avg {kmh(ride.avgSpeedKmh)}</Text>
              {!ride.reviewedAt ? <Text numberOfLines={1} style={styles.reviewMetric}>Needs review</Text> : null}
            </View>
          </Pressable>
        ))}
        {!loading && !error && !rides.length ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}><Ionicons name="map" size={24} color={colors.accent} /></View>
            <Text style={styles.emptyTitle}>No rides here yet</Text>
            <Text style={styles.emptyCopy}>Complete a ride and it will appear in this timeline.</Text>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function rideTitle(ride: Ride) {
  return ride.title?.trim() || `${ride.startLabel} to ${ride.endLabel}`;
}

const createStyles = (colors: ThemeColors) => ({
  content: {
    padding: 16,
    paddingBottom: 110,
    gap: 14
  },
  header: {
    gap: 4,
    paddingTop: 4
  },
  kicker: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  title: {
    color: colors.text,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "900"
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14
  },
  tabs: {
    flexDirection: "row",
    gap: 6
  },
  tab: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border
  },
  activeTab: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  tabText: {
    color: colors.muted,
    fontWeight: "800",
    fontSize: 13,
    textTransform: "capitalize"
  },
  activeTabText: {
    color: colors.onAccent
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 10
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
  },
  routeText: {
    flex: 1,
    minWidth: 0
  },
  route: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 15
  },
  meta: {
    color: colors.muted,
    marginTop: 3,
    fontSize: 13
  },
  distance: {
    color: colors.accent,
    fontWeight: "900",
    fontSize: 17,
    flexShrink: 0,
    maxWidth: 118,
    textAlign: "right"
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  metric: {
    color: colors.muted,
    fontSize: 12,
    flexShrink: 1
  },
  reviewMetric: {
    color: colors.accent,
    fontWeight: "900",
    fontSize: 12,
    flexShrink: 1
  },
  error: {
    color: colors.danger
  },
  pressed: {
    opacity: 0.84,
    transform: [{ scale: 0.992 }]
  },
  empty: {
    alignItems: "center",
    padding: 22,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceHigh,
    marginBottom: 14
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900"
  },
  emptyCopy: {
    color: colors.muted,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 20
  }
});
