import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import { LineChart } from "react-native-chart-kit";
import { api } from "../api/client";
import { Screen } from "../components/Screen";
import { ThemeColors } from "../theme/colors";
import { useTheme, useThemedStyles } from "../theme/ThemeContext";

type Bucket = "daily" | "monthly" | "yearly";
type AnalyticsPoint = {
  bucket: string;
  distanceM: number;
  rideCount: number;
  durationS: number;
  topSpeedKmh: number;
  avgSpeedKmh?: number;
};

type SummaryItem = {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
};

export function AnalyticsScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [bucket, setBucket] = useState<Bucket>("daily");
  const [points, setPoints] = useState<AnalyticsPoint[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(260, width - 32);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setError("");
      const response = await api<{ points: AnalyticsPoint[] }>(`/analytics/distance?bucket=${bucket}`);
      setPoints(Array.isArray(response.points) ? response.points.map(normalizePoint) : []);
    } catch (err: any) {
      setError(err.message || "Analytics unavailable");
    } finally {
      setLoading(false);
    }
  }, [bucket]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const recentPoints = useMemo(() => points.slice(-6), [points]);
  const labels = recentPoints.map((point) => labelFor(point.bucket, bucket));
  const distance = recentPoints.map((point) => finiteNumber(point.distanceM / 1000));
  const durations = recentPoints.map((point) => finiteNumber(point.durationS / 60));
  const topSpeeds = recentPoints.map((point) => finiteNumber(point.topSpeedKmh));

  const summary = useMemo<SummaryItem[]>(() => {
    const totalDistanceM = points.reduce((sum, point) => sum + point.distanceM, 0);
    const totalRides = points.reduce((sum, point) => sum + point.rideCount, 0);
    const totalDurationS = points.reduce((sum, point) => sum + point.durationS, 0);
    const topSpeed = points.reduce((max, point) => Math.max(max, point.topSpeedKmh), 0);

    return [
      { label: "Distance", value: `${formatNumber(totalDistanceM / 1000)} km`, icon: "map", color: colors.accent },
      { label: "Rides", value: String(totalRides), icon: "bicycle", color: colors.blue },
      { label: "Time", value: formatDuration(totalDurationS), icon: "time", color: colors.yellow },
      { label: "Top speed", value: `${Math.round(topSpeed)} km/h`, icon: "flash", color: colors.success }
    ];
  }, [colors, points]);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>Ride analytics</Text>
            <Text style={styles.title}>{titleFor(bucket)}</Text>
          </View>
          {loading ? <ActivityIndicator color={colors.accent} /> : null}
        </View>

        <View style={styles.tabs}>
          {(["daily", "monthly", "yearly"] as Bucket[]).map((item) => (
            <Pressable
              key={item}
              accessibilityRole="button"
              onPress={() => setBucket(item)}
              style={[styles.tab, bucket === item && styles.activeTab]}
            >
              <Text style={[styles.tabText, bucket === item && styles.activeTabText]}>{item}</Text>
            </Pressable>
          ))}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.summaryGrid}>
          {summary.map((item) => (
            <View key={item.label} style={styles.summaryCard}>
              <View style={[styles.summaryIcon, { backgroundColor: item.color }]}>
                <Ionicons name={item.icon} color={colors.background} size={18} />
              </View>
              <Text style={styles.summaryLabel}>{item.label}</Text>
              <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit>
                {item.value}
              </Text>
            </View>
          ))}
        </View>

        {!points.length && !loading ? (
          <View style={styles.empty}>
            <Ionicons name="analytics" color={colors.accent} size={26} />
            <Text style={styles.emptyTitle}>No rides in this range yet</Text>
            <Text style={styles.emptyText}>Complete a ride and this screen will show distance, time, and speed trends.</Text>
          </View>
        ) : null}

        <Chart title="Distance" suffix=" km" labels={labels} data={distance} color={colors.accent} width={chartWidth} colors={colors} styles={styles} />
        <Chart title="Ride duration" suffix=" min" labels={labels} data={durations} color={colors.blue} width={chartWidth} colors={colors} styles={styles} />
        <Chart title="Top speed" suffix=" km/h" labels={labels} data={topSpeeds} color={colors.yellow} width={chartWidth} colors={colors} styles={styles} />
      </ScrollView>
    </Screen>
  );
}

function Chart({
  title,
  suffix,
  labels,
  data,
  color,
  width,
  colors,
  styles
}: {
  title: string;
  suffix: string;
  labels: string[];
  data: number[];
  color: string;
  width: number;
  colors: ThemeColors;
  styles: any;
}) {
  const safeData = data.length ? data.map(finiteNumber) : [0];
  const safeLabels = labels.length ? labels : [""];

  return (
    <View style={styles.chartBlock}>
      <View style={styles.chartHeader}>
        <Text style={styles.chartTitle}>{title}</Text>
        <Text style={styles.chartMeta}>Last {data.length || 0}</Text>
      </View>
      <LineChart
        width={width}
        height={216}
        data={{
          labels: safeLabels,
          datasets: [{ data: safeData }]
        }}
        yAxisSuffix={suffix}
        fromZero
        segments={4}
        chartConfig={{
          backgroundGradientFrom: colors.surface,
          backgroundGradientTo: colors.surface,
          color: () => color,
          labelColor: () => colors.muted,
          decimalPlaces: 0,
          propsForBackgroundLines: {
            stroke: colors.border,
            strokeDasharray: "4 8"
          },
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
  if (!Number.isFinite(date.getTime())) {
    return "--";
  }
  if (bucket === "yearly") {
    return `${date.getFullYear()}`;
  }
  if (bucket === "monthly") {
    return date.toLocaleDateString(undefined, { month: "short" });
  }
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

function titleFor(bucket: Bucket) {
  if (bucket === "yearly") {
    return "Yearly performance";
  }
  if (bucket === "monthly") {
    return "Monthly performance";
  }
  return "Daily performance";
}

function formatNumber(value: number) {
  const safeValue = finiteNumber(value);
  if (safeValue >= 100) {
    return safeValue.toFixed(0);
  }
  return safeValue.toFixed(1);
}

function formatDuration(seconds: number) {
  const minutes = Math.round(finiteNumber(seconds) / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function normalizePoint(point: any): AnalyticsPoint {
  return {
    bucket: typeof point?.bucket === "string" ? point.bucket : "",
    distanceM: finiteNumber(point?.distanceM),
    rideCount: finiteNumber(point?.rideCount),
    durationS: finiteNumber(point?.durationS),
    topSpeedKmh: finiteNumber(point?.topSpeedKmh),
    avgSpeedKmh: finiteNumber(point?.avgSpeedKmh)
  };
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

const createStyles = (colors: ThemeColors) => ({
  content: {
    padding: 18,
    paddingBottom: 36,
    gap: 18
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  kicker: {
    color: colors.accentSoft,
    fontWeight: "900",
    fontSize: 12,
    marginBottom: 4
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "900"
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
    borderRadius: 14,
    borderColor: colors.border,
    borderWidth: 1
  },
  activeTab: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  tabText: {
    color: colors.muted,
    fontWeight: "800",
    textTransform: "capitalize"
  },
  activeTabText: {
    color: colors.onAccent
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  summaryCard: {
    width: "48%",
    minHeight: 112,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14
  },
  summaryIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800"
  },
  summaryValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    marginTop: 3
  },
  chartBlock: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 20,
    overflow: "hidden",
    paddingTop: 12
  },
  chartHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 14,
    marginBottom: 8
  },
  chartTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  chartMeta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800"
  },
  chart: {
    borderRadius: 18
  },
  empty: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    gap: 8
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  emptyText: {
    color: colors.muted,
    lineHeight: 20
  },
  error: {
    color: colors.danger,
    fontWeight: "700"
  }
});
