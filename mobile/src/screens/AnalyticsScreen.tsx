import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LineChart } from "react-native-chart-kit";
import { api } from "../api/client";
import { Screen } from "../components/Screen";
import { colors } from "../theme/colors";

type Bucket = "daily" | "monthly" | "yearly";
type AnalyticsPoint = {
  bucket: string;
  distanceM: number;
  rideCount: number;
  durationS: number;
  topSpeedKmh: number;
};

const chartWidth = Dimensions.get("window").width - 32;

export function AnalyticsScreen() {
  const [bucket, setBucket] = useState<Bucket>("daily");
  const [points, setPoints] = useState<AnalyticsPoint[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const response = await api<{ points: AnalyticsPoint[] }>(`/analytics/distance?bucket=${bucket}`);
      setPoints(response.points);
    } catch (err: any) {
      setError(err.message || "Analytics unavailable");
    }
  }, [bucket]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const labels = points.slice(-6).map((point) => labelFor(point.bucket, bucket));
  const distance = points.slice(-6).map((point) => Number((point.distanceM / 1000).toFixed(1)));
  const durations = points.slice(-6).map((point) => Number((point.durationS / 60).toFixed(0)));
  const topSpeeds = points.slice(-6).map((point) => Number(point.topSpeedKmh));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.tabs}>
          {(["daily", "monthly", "yearly"] as Bucket[]).map((item) => (
            <Pressable
              key={item}
              onPress={() => setBucket(item)}
              style={[styles.tab, bucket === item && styles.activeTab]}
            >
              <Text style={[styles.tabText, bucket === item && styles.activeTabText]}>{item}</Text>
            </Pressable>
          ))}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Chart title="Distance" suffix=" km" labels={labels} data={distance} color={colors.orange} />
        <Chart title="Ride duration" suffix=" min" labels={labels} data={durations} color={colors.blue} />
        <Chart title="Top speed comparison" suffix=" km/h" labels={labels} data={topSpeeds} color={colors.yellow} />
      </ScrollView>
    </Screen>
  );
}

function Chart({
  title,
  suffix,
  labels,
  data,
  color
}: {
  title: string;
  suffix: string;
  labels: string[];
  data: number[];
  color: string;
}) {
  const safeData = data.length ? data : [0];
  const safeLabels = labels.length ? labels : ["--"];

  return (
    <View style={styles.chartBlock}>
      <Text style={styles.chartTitle}>{title}</Text>
      <LineChart
        width={chartWidth}
        height={220}
        data={{
          labels: safeLabels,
          datasets: [{ data: safeData }]
        }}
        yAxisSuffix={suffix}
        chartConfig={{
          backgroundGradientFrom: colors.surface,
          backgroundGradientTo: colors.surface,
          color: () => color,
          labelColor: () => colors.muted,
          decimalPlaces: 0,
          propsForDots: { r: "4", strokeWidth: "2", stroke: color }
        }}
        bezier
        style={styles.chart}
      />
    </View>
  );
}

function labelFor(value: string, bucket: Bucket) {
  const date = new Date(value);
  if (bucket === "yearly") {
    return `${date.getFullYear()}`;
  }
  if (bucket === "monthly") {
    return date.toLocaleDateString(undefined, { month: "short" });
  }
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
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
    borderColor: colors.border,
    borderWidth: 1
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
  chartBlock: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12
  },
  chartTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    marginLeft: 14,
    marginBottom: 8
  },
  chart: {
    borderRadius: 8
  },
  error: {
    color: colors.danger
  }
});
