import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { api } from "../api/client";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { ThemeColors } from "../theme/colors";
import { useTheme, useThemedStyles } from "../theme/ThemeContext";
import { duration, km, kmh, shortDate } from "../utils/format";

type Period = "day" | "month" | "year";
type Report = {
  period: Period;
  generatedAt: string;
  summary: {
    rideCount: number;
    distanceM: number;
    durationS: number;
    averageSpeedKmh: number;
    topSpeedKmh: number;
  };
  routes: Array<{
    from: string;
    to: string;
    distanceM: number;
    durationS: number;
    topSpeedKmh: number;
    startedAt: string;
  }>;
};

export function ReportsScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [period, setPeriod] = useState<Period>("month");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    load();
  }, [period]);

  async function load() {
    try {
      setError("");
      const response = await api<Report>(`/reports?period=${period}`);
      setReport(normalizeReport(response, period));
    } catch (err: any) {
      setError(err.message || "Report unavailable");
    }
  }

  async function exportPdf() {
    if (!report) {
      return;
    }
    setExporting(true);
    try {
      const file = await Print.printToFileAsync({ html: reportHtml(report) });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri);
      }
    } catch (err: any) {
      setError(err.message || "Unable to export PDF");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Exportable insights</Text>
          <Text style={styles.headerTitle}>Ride reports</Text>
          <Text style={styles.headerCopy}>Turn your recent journeys into a clean, shareable PDF.</Text>
        </View>
        <View style={styles.tabs}>
          {(["day", "month", "year"] as Period[]).map((item) => (
            <Pressable
              key={item}
              onPress={() => setPeriod(item)}
              style={[styles.tab, period === item && styles.activeTab]}
            >
              <Text style={[styles.tabText, period === item && styles.activeTabText]}>{item}</Text>
            </Pressable>
          ))}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {report ? (
          <>
            <View style={styles.summary}>
              <Text style={styles.title}>{period} report</Text>
              <View style={styles.metricGrid}>
                <View style={styles.metricBox}><Text style={styles.metricLabel}>Rides</Text><Text style={styles.metricValue}>{report.summary.rideCount}</Text></View>
                <View style={styles.metricBox}><Text style={styles.metricLabel}>Distance</Text><Text style={styles.metricValue}>{km(report.summary.distanceM)}</Text></View>
                <View style={styles.metricBox}><Text style={styles.metricLabel}>Duration</Text><Text style={styles.metricValue}>{duration(report.summary.durationS)}</Text></View>
                <View style={styles.metricBox}><Text style={styles.metricLabel}>Top speed</Text><Text style={styles.metricValue}>{kmh(report.summary.topSpeedKmh)}</Text></View>
              </View>
              <Text style={styles.metric}>Average speed · {kmh(report.summary.averageSpeedKmh)}</Text>
            </View>

            <PrimaryButton label="Export PDF" icon="download" loading={exporting} onPress={exportPdf} />

            {(report.routes || []).map((route, index) => (
              <View key={`${route.startedAt}-${index}`} style={styles.route}>
                <Text style={styles.routeTitle}>{route.from} to {route.to}</Text>
                <Text style={styles.routeMeta}>
                  {shortDate(route.startedAt)} - {km(route.distanceM)} - {duration(route.durationS)} - top {kmh(route.topSpeedKmh)}
                </Text>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function reportHtml(report: Report) {
  const rows = report.routes
    .map(
      (route) => `
        <tr>
          <td>${shortDate(route.startedAt)}</td>
          <td>${escapeHtml(route.from)}</td>
          <td>${escapeHtml(route.to)}</td>
          <td>${km(route.distanceM)}</td>
          <td>${duration(route.durationS)}</td>
          <td>${kmh(route.topSpeedKmh)}</td>
        </tr>
      `
    )
    .join("");

  return `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; color: #111; padding: 24px; }
          h1 { color: #087EA4; }
          table { width: 100%; border-collapse: collapse; margin-top: 24px; }
          th, td { border-bottom: 1px solid #ddd; padding: 8px; text-align: left; }
          .summary { line-height: 1.7; }
        </style>
      </head>
      <body>
        <h1>RidePulse ${escapeHtml(report.period)} report</h1>
        <div class="summary">
          <div>Ride count: ${report.summary.rideCount}</div>
          <div>Distance: ${km(report.summary.distanceM)}</div>
          <div>Total duration: ${duration(report.summary.durationS)}</div>
          <div>Average speed: ${kmh(report.summary.averageSpeedKmh)}</div>
          <div>Top speed: ${kmh(report.summary.topSpeedKmh)}</div>
        </div>
        <table>
          <thead>
            <tr><th>Date</th><th>From</th><th>To</th><th>Distance</th><th>Duration</th><th>Top speed</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
    </html>
  `;
}

function normalizeReport(report: any, fallbackPeriod: Period): Report {
  const summary = report?.summary || {};
  return {
    period: report?.period === "day" || report?.period === "month" || report?.period === "year"
      ? report.period
      : fallbackPeriod,
    generatedAt: typeof report?.generatedAt === "string" ? report.generatedAt : new Date().toISOString(),
    summary: {
      rideCount: finiteNumber(summary.rideCount),
      distanceM: finiteNumber(summary.distanceM),
      durationS: finiteNumber(summary.durationS),
      averageSpeedKmh: finiteNumber(summary.averageSpeedKmh),
      topSpeedKmh: finiteNumber(summary.topSpeedKmh)
    },
    routes: Array.isArray(report?.routes)
      ? report.routes.map((route: any) => ({
          from: safeText(route?.from) || "Start point",
          to: safeText(route?.to) || "End point",
          distanceM: finiteNumber(route?.distanceM),
          durationS: finiteNumber(route?.durationS),
          topSpeedKmh: finiteNumber(route?.topSpeedKmh),
          startedAt: safeText(route?.startedAt)
        }))
      : []
  };
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function safeText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const createStyles = (colors: ThemeColors) => ({
  content: {
    padding: 16,
    paddingBottom: 30,
    gap: 14
  },
  header: {
    gap: 4
  },
  kicker: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  headerTitle: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "900"
  },
  headerCopy: {
    color: colors.muted,
    lineHeight: 20
  },
  tabs: {
    flexDirection: "row",
    gap: 6
  },
  tab: {
    flex: 1,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderRadius: 12,
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
    fontSize: 13,
    textTransform: "capitalize"
  },
  activeTabText: {
    color: colors.onAccent
  },
  summary: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 12
  },
  title: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "900",
    textTransform: "capitalize",
    marginBottom: 4
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  metricBox: {
    width: "48%",
    minHeight: 68,
    borderRadius: 13,
    padding: 10,
    justifyContent: "center",
    backgroundColor: colors.surfaceHigh
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  metricValue: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
    marginTop: 4
  },
  metric: {
    color: colors.textSoft,
    fontSize: 14,
    fontWeight: "700"
  },
  route: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderColor: colors.border,
    borderWidth: 1,
    padding: 12
  },
  routeTitle: {
    color: colors.text,
    fontWeight: "900"
  },
  routeMeta: {
    color: colors.muted,
    marginTop: 4,
    fontSize: 13
  },
  error: {
    color: colors.danger
  }
});
