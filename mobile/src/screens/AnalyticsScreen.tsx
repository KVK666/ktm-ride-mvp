import { Ionicons } from "@expo/vector-icons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";
import { api } from "../api/client";
import { Screen } from "../components/Screen";
import { useAuth } from "../context/AuthContext";
import {
  DEFAULT_MONTHLY_DISTANCE_GOAL_KM,
  getMonthlyDistanceGoalKm,
  isValidMonthlyDistanceGoal,
  saveMonthlyDistanceGoalKm
} from "../services/riderGoal";
import { ThemeColors, typography } from "../theme/colors";
import { useTheme, useThemedStyles } from "../theme/ThemeContext";
import { RiderPulseInsights } from "../types";

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

type InsightRowItem = {
  label: string;
  value: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
};

export function AnalyticsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const styles = useThemedStyles(createStyles);
  const bottomTabBarHeight = useBottomTabBarHeight();
  const floatingTabClearance = Math.max(bottomTabBarHeight, 96) + 56;
  const [bucket, setBucket] = useState<Bucket>("daily");
  const [points, setPoints] = useState<AnalyticsPoint[]>([]);
  const [insights, setInsights] = useState<RiderPulseInsights | null>(null);
  const [chartError, setChartError] = useState("");
  const [insightsError, setInsightsError] = useState("");
  const [loading, setLoading] = useState(false);
  const [goalKm, setGoalKm] = useState(DEFAULT_MONTHLY_DISTANCE_GOAL_KM);
  const [goalDraft, setGoalDraft] = useState(String(DEFAULT_MONTHLY_DISTANCE_GOAL_KM));
  const [goalEditing, setGoalEditing] = useState(false);
  const [goalSaving, setGoalSaving] = useState(false);
  const [goalMessage, setGoalMessage] = useState("");
  const loadSequence = useRef(0);
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(260, width - 40);

  const load = useCallback(async () => {
    const requestId = ++loadSequence.current;
    setLoading(true);
    setChartError("");
    setInsightsError("");

    const chartRequest = api<{ points: AnalyticsPoint[] }>(`/analytics/distance?bucket=${bucket}`);
    const [chartResult, insightsResult] = await Promise.allSettled([
      chartRequest,
      api<{ insights: RiderPulseInsights }>(`/analytics/insights?timezone=${encodeURIComponent(localTimezone())}`)
    ]);

    if (requestId !== loadSequence.current) return;

    if (chartResult.status === "fulfilled") {
      setPoints(normalizePoints(chartResult.value.points));
    } else {
      setPoints([]);
      setChartError(errorMessage(chartResult.reason, "Performance history is unavailable."));
    }

    if (insightsResult.status === "fulfilled" && insightsResult.value?.insights) {
      const normalized = normalizeInsights(insightsResult.value.insights);
      if (normalized) {
        setInsights(normalized);
      } else {
        setInsights(null);
        setInsightsError("The Rider Pulse response was incomplete. Pull to try again.");
      }
    } else {
      const reason = insightsResult.status === "rejected" ? insightsResult.reason : null;
      setInsightsError(errorMessage(reason, "Rider Pulse insights are unavailable."));
    }

    setLoading(false);
  }, [bucket]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      load();
      getMonthlyDistanceGoalKm(user?.id).then((storedGoal) => {
        if (!active) return;
        setGoalKm(storedGoal);
        setGoalDraft(formatGoalInput(storedGoal));
      });
      return () => {
        active = false;
      };
    }, [load, user?.id])
  );

  const recentPoints = useMemo(() => points.slice(-6), [points]);
  const labels = recentPoints.map((point) => labelFor(point.bucket, bucket));
  const distance = recentPoints.map((point) => finiteNumber(point.distanceM / 1000));
  const durations = recentPoints.map((point) => finiteNumber(point.durationS / 60));
  const topSpeeds = recentPoints.map((point) => finiteNumber(point.topSpeedKmh));
  const monthDistanceKm = (insights?.distanceCurrentMonthM || 0) / 1000;
  const goalPercent = Math.min(100, Math.max(0, (monthDistanceKm / Math.max(goalKm, 1)) * 100));
  const projectedMonthKm = (insights?.projectedMonthDistanceM || 0) / 1000;
  const coaching = insights ? coachingMessage(insights, goalKm, monthDistanceKm) : null;

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

  async function saveGoal() {
    const parsedGoal = Number(goalDraft.trim().replace(",", "."));
    if (!isValidMonthlyDistanceGoal(parsedGoal)) {
      setGoalMessage("Enter a goal from 10 to 5,000 km.");
      return;
    }

    setGoalSaving(true);
    setGoalMessage("");
    try {
      const savedGoal = await saveMonthlyDistanceGoalKm(user?.id || "", parsedGoal);
      setGoalKm(savedGoal);
      setGoalDraft(formatGoalInput(savedGoal));
      setGoalEditing(false);
      setGoalMessage("Monthly goal saved on this phone.");
    } catch (error: any) {
      setGoalMessage(error?.message || "Unable to save your monthly goal.");
    } finally {
      setGoalSaving(false);
    }
  }

  function beginGoalEdit() {
    setGoalDraft(formatGoalInput(goalKm));
    setGoalMessage("");
    setGoalEditing(true);
  }

  return (
    <Screen>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: floatingTabClearance }]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>RIDER PULSE</Text>
            <Text style={styles.title}>Your riding rhythm</Text>
            <Text style={styles.subtitle}>Goals, habits, pace and journal health in one clear view.</Text>
          </View>
          {loading ? <ActivityIndicator accessibilityLabel="Refreshing analytics" color={colors.accent} /> : null}
        </View>

        <View style={styles.goalCard}>
          <View style={styles.goalHeader}>
            <View style={styles.goalTitleRow}>
              <View style={styles.goalIcon}>
                <Ionicons name="flag" color={colors.onAccent} size={20} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.goalEyebrow}>MONTHLY DISTANCE GOAL</Text>
                <Text style={styles.goalTitle}>{formatNumber(monthDistanceKm)} of {formatNumber(goalKm)} km</Text>
              </View>
            </View>
            {!goalEditing ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Edit monthly distance goal"
                onPress={beginGoalEdit}
                style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
              >
                <Ionicons name="pencil" color={colors.accent} size={17} />
                <Text style={styles.editButtonText}>Edit</Text>
              </Pressable>
            ) : null}
          </View>

          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel="Monthly distance goal progress"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(goalPercent) }}
            style={styles.progressTrack}
          >
            <View style={[styles.progressFill, { width: `${goalPercent}%` as `${number}%` }]} />
          </View>

          <View style={styles.goalMetaRow}>
            <Text style={styles.goalMeta}>{Math.round(goalPercent)}% complete</Text>
            <Text style={styles.goalMeta}>Projected {formatNumber(projectedMonthKm)} km</Text>
          </View>

          {goalEditing ? (
            <View style={styles.goalEditor}>
              <Text style={styles.inputLabel}>Target distance in kilometres</Text>
              <TextInput
                accessibilityLabel="Monthly goal in kilometres"
                accessibilityHint="Enter a number between 10 and 5000"
                autoFocus
                keyboardType="decimal-pad"
                maxLength={8}
                onChangeText={(value) => {
                  setGoalDraft(value.replace(/[^0-9.,]/g, ""));
                  setGoalMessage("");
                }}
                placeholder="300"
                placeholderTextColor={colors.muted}
                selectTextOnFocus
                style={styles.goalInput}
                value={goalDraft}
              />
              <View style={styles.presets}>
                {[100, 250, 500, 1000].map((preset) => (
                  <Pressable
                    key={preset}
                    accessibilityRole="button"
                    accessibilityLabel={`Set goal to ${preset} kilometres`}
                    onPress={() => setGoalDraft(String(preset))}
                    style={({ pressed }) => [styles.presetButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.presetText}>{preset} km</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.editorActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setGoalEditing(false);
                    setGoalMessage("");
                  }}
                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                >
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Save monthly distance goal"
                  disabled={goalSaving}
                  onPress={saveGoal}
                  style={({ pressed }) => [styles.saveButton, pressed && styles.pressed, goalSaving && styles.disabled]}
                >
                  {goalSaving ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.saveButtonText}>Save goal</Text>}
                </Pressable>
              </View>
            </View>
          ) : null}
          {goalMessage ? (
            <Text
              accessibilityLiveRegion="polite"
              style={goalMessage.startsWith("Monthly") ? styles.success : styles.error}
            >
              {goalMessage}
            </Text>
          ) : null}
        </View>

        {insightsError ? (
          <ErrorPanel message={insightsError} onRetry={load} styles={styles} colors={colors} />
        ) : null}

        {!insights && loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.loadingText}>Reading your latest riding patterns…</Text>
          </View>
        ) : null}

        {insights && coaching ? (
          <>
            <View style={styles.coachingCard}>
              <View style={styles.coachingIcon}>
                <Ionicons name={coaching.icon} color={colors.blue} size={22} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.coachingEyebrow}>PULSE CHECK</Text>
                <Text style={styles.coachingTitle}>{coaching.title}</Text>
                <Text style={styles.coachingCopy}>{coaching.body}</Text>
              </View>
            </View>

            <SectionHeader title="Last 30 days" meta={updatedLabel(insights.generatedAt)} styles={styles} />
            <View style={styles.insightGrid}>
              <InsightMetric icon="map" label="Distance" value={`${formatNumber(insights.distanceLast30DaysM / 1000)} km`} styles={styles} colors={colors} />
              <InsightMetric icon="bicycle" label="Rides" value={String(insights.ridesLast30Days)} styles={styles} colors={colors} />
              <InsightMetric icon="calendar" label="Active days" value={String(insights.activeDaysLast30Days)} styles={styles} colors={colors} />
              <InsightMetric icon="flame" label="Ride-day streak" value={`${insights.currentRideDayStreak} d`} styles={styles} colors={colors} />
            </View>

            {insights.ridesLast30Days === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="sparkles" color={colors.accent} size={26} />
                <Text style={styles.emptyTitle}>Your next ride starts the pulse</Text>
                <Text style={styles.emptyText}>Track a ride to unlock pace, habit, streak and journal insights here.</Text>
              </View>
            ) : null}

            <InsightGroup
              icon="trending-up"
              title="Momentum"
              rows={[
                {
                  label: "30-day trend",
                  value: formatTrend(insights.distanceTrendPercent),
                  detail: "Compared with the previous 30 days",
                  icon: trendIcon(insights.distanceTrendPercent)
                },
                {
                  label: "Previous distance",
                  value: `${formatNumber(insights.distancePrevious30DaysM / 1000)} km`,
                  detail: "Your comparison baseline",
                  icon: "return-down-back"
                },
                {
                  label: "Month projection",
                  value: `${formatNumber(projectedMonthKm)} km`,
                  detail: projectedMonthKm >= goalKm ? "On pace to reach your goal" : "Keep riding to lift your forecast",
                  icon: "navigate-circle"
                }
              ]}
              styles={styles}
              colors={colors}
            />

            <InsightGroup
              icon="speedometer"
              title="Ride shape"
              rows={[
                { label: "Longest ride", value: `${formatNumber(insights.longestRideM / 1000)} km`, detail: "Your standout distance", icon: "trophy" },
                { label: "Average distance", value: `${formatNumber(insights.averageRideDistanceM / 1000)} km`, detail: "Typical ride length", icon: "resize" },
                { label: "Average duration", value: formatDuration(insights.averageRideDurationS), detail: "Typical time in the saddle", icon: "time" },
                { label: "Average top speed", value: `${formatNumber(insights.averageTopSpeedKmh)} km/h`, detail: "Average of each ride peak", icon: "flash" }
              ]}
              styles={styles}
              colors={colors}
            />

            <InsightGroup
              icon="compass"
              title="Habits & journal"
              rows={[
                { label: "Favourite weekday", value: insights.favoriteWeekday || "Not enough rides", detail: "The day you ride most", icon: "calendar-number" },
                { label: "Favourite time", value: insights.favoriteTimeOfDay || "Not enough rides", detail: "Your most common ride window", icon: "sunny" },
                { label: "Ride reviews", value: `${Math.round(insights.reviewCompletionPercent)}%`, detail: "Rides with a saved reflection", icon: "checkmark-done" },
                { label: "Needs attention", value: String(insights.cleanupCandidateCount), detail: insights.cleanupCandidateCount ? "Short or accidental rides to review" : "Your journal looks tidy", icon: "sparkles" }
              ]}
              styles={styles}
              colors={colors}
            />
          </>
        ) : null}

        <SectionHeader title="Performance history" meta="Explore by range" styles={styles} />
        <View style={styles.tabs}>
          {(["daily", "monthly", "yearly"] as Bucket[]).map((item) => (
            <Pressable
              key={item}
              accessibilityRole="button"
              accessibilityLabel={`Show ${item} performance`}
              accessibilityState={{ selected: bucket === item }}
              onPress={() => setBucket(item)}
              style={({ pressed }) => [styles.tab, bucket === item && styles.activeTab, pressed && styles.pressed]}
            >
              <Text style={[styles.tabText, bucket === item && styles.activeTabText]}>{item}</Text>
            </Pressable>
          ))}
        </View>

        {chartError ? <ErrorPanel message={chartError} onRetry={load} styles={styles} colors={colors} /> : null}

        {points.length ? (
          <>
            <View style={styles.summaryGrid}>
              {summary.map((item) => (
                <View key={item.label} accessible accessibilityLabel={`${item.label}: ${item.value}`} style={styles.summaryCard}>
                  <View style={[styles.summaryIcon, { backgroundColor: item.color }]}>
                    <Ionicons name={item.icon} color={colors.background} size={18} />
                  </View>
                  <Text style={styles.summaryLabel}>{item.label}</Text>
                  <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit>{item.value}</Text>
                </View>
              ))}
            </View>
            <Chart title="Distance" suffix=" km" labels={labels} data={distance} color={colors.accent} width={chartWidth} colors={colors} styles={styles} />
            <Chart title="Ride duration" suffix=" min" labels={labels} data={durations} color={colors.blue} width={chartWidth} colors={colors} styles={styles} />
            <Chart title="Top speed" suffix=" km/h" labels={labels} data={topSpeeds} color={colors.yellow} width={chartWidth} colors={colors} styles={styles} />
          </>
        ) : !loading && !chartError ? (
          <View style={styles.empty}>
            <Ionicons name="analytics" color={colors.accent} size={26} />
            <Text style={styles.emptyTitle}>No rides in this range yet</Text>
            <Text style={styles.emptyText}>Complete a ride and this section will show distance, time and speed trends.</Text>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function SectionHeader({ title, meta, styles }: { title: string; meta: string; styles: any }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionMeta}>{meta}</Text>
    </View>
  );
}

function InsightMetric({
  icon,
  label,
  value,
  styles,
  colors
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  styles: any;
  colors: ThemeColors;
}) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={styles.insightMetric}>
      <Ionicons name={icon} color={colors.accent} size={18} />
      <Text style={styles.insightMetricLabel}>{label}</Text>
      <Text style={styles.insightMetricValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

function InsightGroup({
  icon,
  title,
  rows,
  styles,
  colors
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  rows: InsightRowItem[];
  styles: any;
  colors: ThemeColors;
}) {
  return (
    <View style={styles.insightGroup}>
      <View style={styles.insightGroupHeader}>
        <View style={styles.insightGroupIcon}><Ionicons name={icon} color={colors.accent} size={18} /></View>
        <Text style={styles.insightGroupTitle}>{title}</Text>
      </View>
      {rows.map((row, index) => (
        <View
          key={row.label}
          accessible
          accessibilityLabel={`${row.label}: ${row.value}. ${row.detail}`}
          style={[styles.insightRow, index < rows.length - 1 && styles.insightRowBorder]}
        >
          <View style={styles.insightRowIcon}><Ionicons name={row.icon} color={colors.blue} size={17} /></View>
          <View style={styles.flex}>
            <Text style={styles.insightRowLabel}>{row.label}</Text>
            <Text style={styles.insightRowDetail}>{row.detail}</Text>
          </View>
          <Text style={styles.insightRowValue} numberOfLines={2}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

function ErrorPanel({ message, onRetry, styles, colors }: { message: string; onRetry: () => void; styles: any; colors: ThemeColors }) {
  return (
    <View accessibilityRole="alert" style={styles.errorPanel}>
      <Ionicons name="cloud-offline" color={colors.danger} size={22} />
      <View style={styles.flex}>
        <Text style={styles.errorTitle}>Couldn’t refresh this section</Text>
        <Text style={styles.errorCopy}>{message}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Retry analytics" onPress={onRetry} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
        <Text style={styles.retryText}>Retry</Text>
      </Pressable>
    </View>
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
  const height = 190;
  const horizontalPadding = 18;
  const verticalPadding = 18;
  const max = Math.max(...safeData, 1);
  const chartPoints = safeData.map((value, index) => ({
    x: horizontalPadding + (index / Math.max(1, safeData.length - 1)) * (width - horizontalPadding * 2),
    y: height - verticalPadding - (value / max) * (height - verticalPadding * 2)
  }));
  const points = chartPoints.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <View style={styles.chartBlock}>
      <View style={styles.chartHeader}>
        <Text style={styles.chartTitle}>{title}</Text>
        <Text style={styles.chartMeta}>Last {data.length || 0}</Text>
      </View>
      <View accessible accessibilityLabel={`${title} trend, maximum ${Math.round(max)}${suffix}`}>
        <Svg width={width} height={height}>
          {[0.25, 0.5, 0.75].map((position) => (
            <Line key={position} x1={horizontalPadding} x2={width - horizontalPadding} y1={height * position} y2={height * position} stroke={colors.border} strokeDasharray="3 8" />
          ))}
          <Polyline points={points} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          {chartPoints.map((point, index) => <Circle key={index} cx={point.x} cy={point.y} r="4" fill={colors.surface} stroke={color} strokeWidth="3" />)}
        </Svg>
        <View style={styles.chartLabels}>
          {safeLabels.map((label, index) => <Text key={`${label}-${index}`} numberOfLines={1} style={styles.chartLabel}>{label}</Text>)}
        </View>
      </View>
    </View>
  );
}

function coachingMessage(insights: RiderPulseInsights, goalKm: number, monthDistanceKm: number): { title: string; body: string; icon: keyof typeof Ionicons.glyphMap } {
  const projectedKm = insights.projectedMonthDistanceM / 1000;
  if (monthDistanceKm >= goalKm) {
    return { title: "Goal unlocked", body: `You passed ${formatNumber(goalKm)} km this month. Every new ride extends the win.`, icon: "trophy" };
  }
  if (insights.ridesLast30Days === 0) {
    return { title: "Your next ride starts the story", body: "Track one ride and Rider Pulse will begin learning your pace and habits.", icon: "sparkles" };
  }
  if (projectedKm >= goalKm) {
    return { title: "You’re on pace", body: `At your current rhythm, you’re projected to reach ${formatNumber(projectedKm)} km this month.`, icon: "rocket" };
  }
  if (insights.cleanupCandidateCount > 0) {
    return { title: "Tidy the journal", body: `${insights.cleanupCandidateCount} ${insights.cleanupCandidateCount === 1 ? "ride looks" : "rides look"} short or accidental. A quick review keeps insights accurate.`, icon: "checkmark-circle" };
  }
  if (insights.distanceTrendPercent !== null && insights.distanceTrendPercent > 0) {
    return { title: "Momentum is building", body: `Distance is up ${formatNumber(insights.distanceTrendPercent)}% versus your previous 30 days.`, icon: "trending-up" };
  }
  const remainingKm = Math.max(0, goalKm - monthDistanceKm);
  return { title: "Keep the rhythm", body: `${formatNumber(remainingKm)} km remains on this month’s goal. A short ride still moves the bar.`, icon: "pulse" };
}

function normalizeInsights(value: any): RiderPulseInsights | null {
  const requiredNumbers = [
    "ridesLast30Days",
    "distanceLast30DaysM",
    "distancePrevious30DaysM",
    "distanceCurrentMonthM",
    "activeDaysLast30Days",
    "currentRideDayStreak",
    "longestRideM",
    "averageRideDistanceM",
    "averageRideDurationS",
    "averageTopSpeedKmh",
    "reviewCompletionPercent",
    "cleanupCandidateCount",
    "projectedMonthDistanceM"
  ];
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof value.generatedAt !== "string" ||
    !value.generatedAt ||
    requiredNumbers.some(
      (key) => value[key] === null || value[key] === undefined || !Number.isFinite(Number(value[key]))
    )
  ) {
    return null;
  }
  return {
    generatedAt: typeof value?.generatedAt === "string" ? value.generatedAt : "",
    ridesLast30Days: nonNegativeInteger(value?.ridesLast30Days),
    distanceLast30DaysM: nonNegative(value?.distanceLast30DaysM),
    distancePrevious30DaysM: nonNegative(value?.distancePrevious30DaysM),
    distanceCurrentMonthM: nonNegative(value?.distanceCurrentMonthM),
    distanceTrendPercent: nullableNumber(value?.distanceTrendPercent),
    activeDaysLast30Days: nonNegativeInteger(value?.activeDaysLast30Days),
    currentRideDayStreak: nonNegativeInteger(value?.currentRideDayStreak),
    longestRideM: nonNegative(value?.longestRideM),
    averageRideDistanceM: nonNegative(value?.averageRideDistanceM),
    averageRideDurationS: nonNegative(value?.averageRideDurationS),
    averageTopSpeedKmh: nonNegative(value?.averageTopSpeedKmh),
    favoriteWeekday: optionalLabel(value?.favoriteWeekday),
    favoriteTimeOfDay: optionalLabel(value?.favoriteTimeOfDay),
    reviewCompletionPercent: Math.min(100, nonNegative(value?.reviewCompletionPercent)),
    cleanupCandidateCount: nonNegativeInteger(value?.cleanupCandidateCount),
    projectedMonthDistanceM: nonNegative(value?.projectedMonthDistanceM)
  };
}

function normalizePoints(value: unknown): AnalyticsPoint[] {
  return Array.isArray(value) ? value.map(normalizePoint) : [];
}

function normalizePoint(point: any): AnalyticsPoint {
  return {
    bucket: typeof point?.bucket === "string" ? point.bucket : "",
    distanceM: nonNegative(point?.distanceM),
    rideCount: nonNegative(point?.rideCount),
    durationS: nonNegative(point?.durationS),
    topSpeedKmh: nonNegative(point?.topSpeedKmh),
    avgSpeedKmh: nonNegative(point?.avgSpeedKmh)
  };
}

function labelFor(value: string, bucket: Bucket) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "--";
  if (bucket === "yearly") return `${date.getFullYear()}`;
  if (bucket === "monthly") return date.toLocaleDateString(undefined, { month: "short" });
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

function formatTrend(value: number | null) {
  if (value === null) return "New baseline";
  if (value === 0) return "No change";
  return `${value > 0 ? "+" : ""}${formatNumber(value)}%`;
}

function trendIcon(value: number | null): keyof typeof Ionicons.glyphMap {
  if (value === null || value === 0) return "remove";
  return value > 0 ? "trending-up" : "trending-down";
}

function updatedLabel(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Latest available";
  return `Updated ${date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
}

function formatGoalInput(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatNumber(value: number) {
  const safeValue = finiteNumber(value);
  if (Math.abs(safeValue) >= 100) return safeValue.toFixed(0);
  return safeValue.toFixed(1);
}

function formatDuration(seconds: number) {
  const minutes = Math.round(nonNegative(seconds) / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function optionalLabel(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function nonNegative(value: unknown) {
  return Math.max(0, finiteNumber(value));
}

function nonNegativeInteger(value: unknown) {
  return Math.round(nonNegative(value));
}

function errorMessage(reason: any, fallback: string) {
  return typeof reason?.message === "string" && reason.message.trim() ? reason.message : fallback;
}

function localTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const createStyles = (colors: ThemeColors) => ({
  content: { padding: 20, gap: 18 },
  flex: { flex: 1 },
  pressed: { opacity: 0.84, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.6 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headerCopy: { flex: 1 },
  kicker: { color: colors.accent, fontFamily: typography.bold, fontSize: 10, letterSpacing: 1.4, marginBottom: 4 },
  title: { color: colors.text, fontSize: 30, fontFamily: typography.extraBold },
  subtitle: { color: colors.muted, fontFamily: typography.regular, fontSize: 13, lineHeight: 20, marginTop: 5 },
  goalCard: { backgroundColor: colors.surfaceHigh, borderColor: colors.borderStrong, borderWidth: 1, borderRadius: 26, padding: 17, gap: 13 },
  goalHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  goalTitleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 11 },
  goalIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  goalEyebrow: { color: colors.muted, fontFamily: typography.bold, fontSize: 9, letterSpacing: 1.1 },
  goalTitle: { color: colors.text, fontFamily: typography.extraBold, fontSize: 20, marginTop: 2 },
  editButton: { minHeight: 44, minWidth: 64, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 9, borderRadius: 14, backgroundColor: `${colors.accent}12` },
  editButtonText: { color: colors.accent, fontFamily: typography.bold, fontSize: 12 },
  progressTrack: { height: 10, borderRadius: 6, backgroundColor: colors.elevated, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 6, backgroundColor: colors.accent },
  goalMetaRow: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  goalMeta: { color: colors.muted, fontFamily: typography.semibold, fontSize: 11 },
  goalEditor: { gap: 10, paddingTop: 2 },
  inputLabel: { color: colors.textSoft, fontFamily: typography.bold, fontSize: 12 },
  goalInput: { minHeight: 50, borderRadius: 16, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.background, color: colors.text, paddingHorizontal: 15, fontFamily: typography.bold, fontSize: 18 },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  presetButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  presetText: { color: colors.textSoft, fontFamily: typography.bold, fontSize: 11 },
  editorActions: { flexDirection: "row", gap: 10 },
  secondaryButton: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 16, borderWidth: 1, borderColor: colors.borderStrong },
  secondaryButtonText: { color: colors.text, fontFamily: typography.bold },
  saveButton: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: colors.accent },
  saveButtonText: { color: colors.onAccent, fontFamily: typography.extraBold },
  success: { color: colors.success, fontFamily: typography.semibold, fontSize: 12 },
  error: { color: colors.danger, fontFamily: typography.semibold, fontSize: 12 },
  coachingCard: { flexDirection: "row", gap: 12, borderRadius: 22, padding: 16, backgroundColor: `${colors.blue}12`, borderWidth: 1, borderColor: `${colors.blue}28` },
  coachingIcon: { width: 42, height: 42, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: `${colors.blue}18` },
  coachingEyebrow: { color: colors.blue, fontFamily: typography.bold, fontSize: 9, letterSpacing: 1.1 },
  coachingTitle: { color: colors.text, fontFamily: typography.extraBold, fontSize: 18, marginTop: 2 },
  coachingCopy: { color: colors.muted, fontFamily: typography.regular, fontSize: 12, lineHeight: 18, marginTop: 4 },
  sectionHeader: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginTop: 2 },
  sectionTitle: { color: colors.text, fontFamily: typography.extraBold, fontSize: 21 },
  sectionMeta: { color: colors.muted, fontFamily: typography.semibold, fontSize: 10 },
  insightGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  insightMetric: { width: "48%", minHeight: 108, borderRadius: 19, padding: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  insightMetricLabel: { color: colors.muted, fontFamily: typography.bold, fontSize: 11, marginTop: 9 },
  insightMetricValue: { color: colors.text, fontFamily: typography.extraBold, fontSize: 22, marginTop: 2 },
  insightGroup: { borderRadius: 24, paddingHorizontal: 16, paddingTop: 15, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  insightGroupHeader: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 9 },
  insightGroupIcon: { width: 36, height: 36, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: `${colors.accent}12` },
  insightGroupTitle: { color: colors.text, fontFamily: typography.extraBold, fontSize: 18 },
  insightRow: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  insightRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  insightRowIcon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: `${colors.blue}10` },
  insightRowLabel: { color: colors.textSoft, fontFamily: typography.bold, fontSize: 12 },
  insightRowDetail: { color: colors.muted, fontFamily: typography.regular, fontSize: 10, lineHeight: 15, marginTop: 2 },
  insightRowValue: { color: colors.text, fontFamily: typography.extraBold, fontSize: 14, maxWidth: "34%", textAlign: "right" },
  loadingCard: { minHeight: 88, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 11, backgroundColor: colors.surface, borderRadius: 20 },
  loadingText: { color: colors.muted, fontFamily: typography.medium, fontSize: 12 },
  errorPanel: { flexDirection: "row", alignItems: "center", gap: 11, borderRadius: 20, padding: 14, backgroundColor: `${colors.danger}10`, borderWidth: 1, borderColor: `${colors.danger}26` },
  errorTitle: { color: colors.text, fontFamily: typography.bold, fontSize: 12 },
  errorCopy: { color: colors.muted, fontFamily: typography.regular, fontSize: 10, lineHeight: 15, marginTop: 2 },
  retryButton: { minHeight: 44, minWidth: 58, alignItems: "center", justifyContent: "center", paddingHorizontal: 10, borderRadius: 14, backgroundColor: colors.elevated },
  retryText: { color: colors.accent, fontFamily: typography.bold, fontSize: 11 },
  tabs: { flexDirection: "row", gap: 8 },
  tab: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderRadius: 14, borderColor: colors.border, borderWidth: 1 },
  activeTab: { backgroundColor: colors.accent, borderColor: colors.accent },
  tabText: { color: colors.muted, fontFamily: typography.bold, textTransform: "capitalize" },
  activeTabText: { color: colors.onAccent },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  summaryCard: { width: "48%", minHeight: 112, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 14 },
  summaryIcon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  summaryLabel: { color: colors.muted, fontSize: 12, fontFamily: typography.bold },
  summaryValue: { color: colors.text, fontSize: 24, fontFamily: typography.extraBold, marginTop: 3 },
  chartBlock: { backgroundColor: colors.surface, borderRadius: 26, overflow: "hidden", paddingTop: 12 },
  chartHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: 14, marginBottom: 8 },
  chartTitle: { color: colors.text, fontSize: 18, fontFamily: typography.extraBold },
  chartMeta: { color: colors.muted, fontSize: 12, fontFamily: typography.bold },
  chartLabels: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 15 },
  chartLabel: { flex: 1, textAlign: "center", color: colors.muted, fontFamily: typography.medium, fontSize: 9 },
  empty: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 20, padding: 20, gap: 8 },
  emptyTitle: { color: colors.text, fontSize: 18, fontFamily: typography.extraBold },
  emptyText: { color: colors.muted, fontFamily: typography.regular, lineHeight: 20 }
});
