import { useFocusEffect, useNavigation } from "@react-navigation/native";
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

        {loading ? <ActivityIndicator color={colors.orange} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {rides.map((ride) => (
          <Pressable
            key={ride.id}
            onPress={() => navigation.navigate("RideDetail", { rideId: ride.id, reviewMode: !ride.reviewedAt })}
            style={styles.card}
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
      </ScrollView>
    </Screen>
  );
}

function rideTitle(ride: Ride) {
  return ride.title?.trim() || `${ride.startLabel} to ${ride.endLabel}`;
}

const createStyles = (colors: ThemeColors) => ({
  content: {
    padding: 18,
    gap: 14
  },
  tabs: {
    flexDirection: "row",
    gap: 8
  },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border
  },
  activeTab: {
    backgroundColor: colors.orange,
    borderColor: colors.orange
  },
  tabText: {
    color: colors.muted,
    fontWeight: "800",
    textTransform: "capitalize"
  },
  activeTabText: {
    color: colors.text
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    gap: 12
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
    fontSize: 17
  },
  meta: {
    color: colors.muted,
    marginTop: 4
  },
  distance: {
    color: colors.orange,
    fontWeight: "900",
    fontSize: 20,
    flexShrink: 0,
    maxWidth: 118,
    textAlign: "right"
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  metric: {
    color: colors.muted,
    flexShrink: 1
  },
  reviewMetric: {
    color: colors.orange,
    fontWeight: "900",
    flexShrink: 1
  },
  error: {
    color: colors.danger
  }
});
