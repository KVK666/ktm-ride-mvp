import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../api/client";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { colors } from "../theme/colors";
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
      setReport(response);
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
              <Text style={styles.metric}>Ride count: {report.summary.rideCount}</Text>
              <Text style={styles.metric}>Distance: {km(report.summary.distanceM)}</Text>
              <Text style={styles.metric}>Total duration: {duration(report.summary.durationS)}</Text>
              <Text style={styles.metric}>Average speed: {kmh(report.summary.averageSpeedKmh)}</Text>
              <Text style={styles.metric}>Top speed: {kmh(report.summary.topSpeedKmh)}</Text>
            </View>

            <PrimaryButton label="Export PDF" icon="download" loading={exporting} onPress={exportPdf} />

            {report.routes.map((route, index) => (
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
          <td>${route.from}</td>
          <td>${route.to}</td>
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
          h1 { color: #ff6a00; }
          table { width: 100%; border-collapse: collapse; margin-top: 24px; }
          th, td { border-bottom: 1px solid #ddd; padding: 8px; text-align: left; }
          .summary { line-height: 1.7; }
        </style>
      </head>
      <body>
        <h1>Duke Ride ${report.period} report</h1>
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
  summary: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    gap: 6
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    textTransform: "capitalize",
    marginBottom: 6
  },
  metric: {
    color: colors.text,
    fontSize: 16
  },
  route: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderColor: colors.border,
    borderWidth: 1,
    padding: 14
  },
  routeTitle: {
    color: colors.text,
    fontWeight: "900"
  },
  routeMeta: {
    color: colors.muted,
    marginTop: 6
  },
  error: {
    color: colors.danger
  }
});
