import { Ionicons } from "@expo/vector-icons";
import { RouteProp, useFocusEffect, useRoute } from "@react-navigation/native";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Dimensions, ScrollView, StyleSheet, Text, View } from "react-native";
import { LineChart } from "react-native-chart-kit";
import { api } from "../api/client";
import { RideMap } from "../components/RideMap";
import { Screen } from "../components/Screen";
import { StatCard } from "../components/StatCard";
import { colors } from "../theme/colors";
import { Ride, RidePoint } from "../types";
import { duration, km, kmh, shortDate, time } from "../utils/format";

type RideDetailParams = {
  RideDetail: {
    rideId: string;
  };
};

const chartWidth = Dimensions.get("window").width - 32;

export function RideDetailScreen() {
  const route = useRoute<RouteProp<RideDetailParams, "RideDetail">>();
  const [ride, setRide] = useState<Ride | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await api<{ ride: Ride }>(`/rides/${route.params.rideId}`);
      setRide(response.ride);
    } catch (err: any) {
      setRide(null);
      setError(err.message || "Unable to load ride details");
    } finally {
      setLoading(false);
    }
  }, [route.params.rideId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const speedChart = useMemo(() => buildSpeedChart(ride?.points || []), [ride?.points]);

  if (loading) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color={colors.orange} />
      </Screen>
    );
  }

  if (!ride) {
    return (
      <Screen style={styles.empty}>
        <Text style={styles.error}>{error || "Ride detail unavailable"}</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>Ride detail</Text>
          <Text style={styles.title}>{shortDate(ride.startedAt)} ride</Text>
          <Text style={styles.subtitle}>
            {time(ride.startedAt)} to {ride.endedAt ? time(ride.endedAt) : "--"}
          </Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {ride.points?.length ? (
          <RideMap coordinates={ride.points} title={`${ride.startLabel} to ${ride.endLabel}`} />
        ) : (
          <View style={styles.emptyMap}>
            <Ionicons name="map" color={colors.muted} size={26} />
            <Text style={styles.emptyMapText}>Route points unavailable</Text>
          </View>
        )}

        <View style={styles.grid}>
          <StatCard label="Distance" value={km(ride.distanceM)} accent={colors.orange} />
          <StatCard label="Duration" value={duration(ride.durationS)} />
          <StatCard label="Top speed" value={kmh(ride.topSpeedKmh)} accent={colors.yellow} />
          <StatCard label="Average" value={kmh(ride.avgSpeedKmh)} accent={colors.blue} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Route summary</Text>
          <RouteRow icon="radio-button-on" label="From" value={ride.startLabel} />
          <RouteRow icon="flag" label="To" value={ride.endLabel} />
          <RouteRow icon="calendar" label="Date" value={`${shortDate(ride.startedAt)} at ${time(ride.startedAt)}`} />
          <RouteRow icon="pulse" label="GPS points" value={`${ride.points?.length || 0}`} />
        </View>

        <View style={styles.chartBlock}>
          <Text style={styles.sectionTitle}>Speed over time</Text>
          <LineChart
            width={chartWidth}
            height={220}
            data={{
              labels: speedChart.labels,
              datasets: [{ data: speedChart.data }]
            }}
            yAxisSuffix=" km/h"
            chartConfig={{
              backgroundGradientFrom: colors.surface,
              backgroundGradientTo: colors.surface,
              color: () => colors.orange,
              labelColor: () => colors.muted,
              decimalPlaces: 0,
              propsForDots: { r: "4", strokeWidth: "2", stroke: colors.orange }
            }}
            bezier
            style={styles.chart}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

function RouteRow({
  icon,
  label,
  value
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.routeRow}>
      <View style={styles.routeIcon}>
        <Ionicons name={icon} color={colors.orange} size={18} />
      </View>
      <View style={styles.routeText}>
        <Text style={styles.routeLabel}>{label}</Text>
        <Text style={styles.routeValue}>{value}</Text>
      </View>
    </View>
  );
}

function buildSpeedChart(points: RidePoint[]) {
  const speeds = points.map((point) => Math.max(0, Math.round(point.speedKmh || 0)));
  if (!speeds.length) {
    return { labels: ["--"], data: [0] };
  }

  const sampleCount = Math.min(6, speeds.length);
  const step = Math.max(1, Math.floor(speeds.length / sampleCount));
  const sampled = points.filter((_, index) => index % step === 0).slice(0, sampleCount);
  const labels = sampled.map((point) => time(point.recordedAt));
  const data = sampled.map((point) => Math.max(0, Math.round(point.speedKmh || 0)));
  return {
    labels: labels.length ? labels : ["--"],
    data: data.length ? data : [0]
  };
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    justifyContent: "center"
  },
  empty: {
    padding: 16,
    justifyContent: "center"
  },
  content: {
    padding: 16,
    gap: 16
  },
  hero: {
    gap: 4
  },
  kicker: {
    color: colors.orange,
    fontWeight: "900"
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "900"
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14
  },
  emptyMap: {
    minHeight: 180,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: 8
  },
  emptyMapText: {
    color: colors.muted,
    fontWeight: "800"
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    gap: 12
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  routeIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.surfaceHigh,
    alignItems: "center",
    justifyContent: "center"
  },
  routeText: {
    flex: 1
  },
  routeLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800"
  },
  routeValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 2
  },
  chartBlock: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingTop: 14
  },
  chart: {
    borderRadius: 8,
    marginTop: 8
  },
  error: {
    color: colors.danger
  }
});
