import { useFocusEffect, useNavigation } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../api/client";
import { Screen } from "../components/Screen";
import { colors } from "../theme/colors";
import { Ride } from "../types";
import { duration, km, kmh, shortDate, time } from "../utils/format";

type Period = "today" | "month" | "year";

export function HistoryScreen() {
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
      setRides(response.rides);
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
            onPress={() => navigation.navigate("RideDetail", { rideId: ride.id })}
            style={styles.card}
          >
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.route}>{ride.startLabel} to {ride.endLabel}</Text>
                <Text style={styles.meta}>{shortDate(ride.startedAt)} - {time(ride.startedAt)}</Text>
              </View>
              <Text style={styles.distance}>{km(ride.distanceM)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.metric}>Duration {duration(ride.durationS)}</Text>
              <Text style={styles.metric}>Top {kmh(ride.topSpeedKmh)}</Text>
              <Text style={styles.metric}>Avg {kmh(ride.avgSpeedKmh)}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 12
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
    padding: 14,
    gap: 12
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
  },
  route: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 16
  },
  meta: {
    color: colors.muted,
    marginTop: 4
  },
  distance: {
    color: colors.orange,
    fontWeight: "900",
    fontSize: 18
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  metric: {
    color: colors.muted
  },
  error: {
    color: colors.danger
  }
});
