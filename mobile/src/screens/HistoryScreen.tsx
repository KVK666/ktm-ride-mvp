import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { RideMap } from "../components/RideMap";
import { Screen } from "../components/Screen";
import { colors } from "../theme/colors";
import { Ride } from "../types";
import { duration, km, kmh, shortDate, time } from "../utils/format";

type Period = "today" | "month" | "year";

export function HistoryScreen() {
  const [period, setPeriod] = useState<Period>("month");
  const [rides, setRides] = useState<Ride[]>([]);
  const [selectedRide, setSelectedRide] = useState<Ride | null>(null);
  const [mapFullScreen, setMapFullScreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await api<{ rides: Ride[] }>(`/rides?period=${period}`);
      setRides(response.rides);
      setSelectedRide(null);
      setMapFullScreen(false);
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

  async function openRide(ride: Ride) {
    try {
      setError("");
      const response = await api<{ ride: Ride }>(`/rides/${ride.id}`);
      setSelectedRide(response.ride);
    } catch (err: any) {
      setSelectedRide(null);
      setError(err.message || "Unable to open this ride");
    }
  }

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

        {selectedRide?.points?.length ? (
          <View style={styles.detail}>
            <View style={styles.mapCard}>
              <RideMap coordinates={selectedRide.points} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open ride map full screen"
                onPress={() => setMapFullScreen(true)}
                style={styles.expandButton}
              >
                <Ionicons name="expand" size={22} color={colors.text} />
              </Pressable>
            </View>
            <Text style={styles.detailTitle}>{selectedRide.startLabel} to {selectedRide.endLabel}</Text>
          </View>
        ) : null}

        {rides.map((ride) => (
          <Pressable key={ride.id} onPress={() => openRide(ride)} style={styles.card}>
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
      <Modal
        visible={mapFullScreen && Boolean(selectedRide?.points?.length)}
        animationType="slide"
        onRequestClose={() => setMapFullScreen(false)}
      >
        <View style={styles.fullScreen}>
          <RideMap coordinates={selectedRide?.points || []} style={styles.fullScreenMap} />
          <View style={styles.fullScreenHeader}>
            <Text style={styles.fullScreenTitle} numberOfLines={1}>
              {selectedRide ? `${selectedRide.startLabel} to ${selectedRide.endLabel}` : "Ride map"}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close full screen map"
              onPress={() => setMapFullScreen(false)}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={26} color={colors.text} />
            </Pressable>
          </View>
        </View>
      </Modal>
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
  detail: {
    gap: 10
  },
  mapCard: {
    position: "relative",
    borderRadius: 8,
    overflow: "hidden"
  },
  expandButton: {
    position: "absolute",
    right: 12,
    top: 12,
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8, 9, 11, 0.82)",
    borderColor: colors.border,
    borderWidth: 1
  },
  detailTitle: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 18
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
  },
  fullScreen: {
    flex: 1,
    backgroundColor: colors.background
  },
  fullScreenMap: {
    flex: 1,
    width: "100%",
    height: "100%",
    borderRadius: 0
  },
  fullScreenHeader: {
    position: "absolute",
    left: 16,
    right: 16,
    top: 42,
    minHeight: 58,
    borderRadius: 8,
    backgroundColor: "rgba(8, 9, 11, 0.88)",
    borderColor: colors.border,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingLeft: 14,
    paddingRight: 8
  },
  fullScreenTitle: {
    flex: 1,
    color: colors.text,
    fontWeight: "900",
    fontSize: 16
  },
  closeButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.orange
  }
});
