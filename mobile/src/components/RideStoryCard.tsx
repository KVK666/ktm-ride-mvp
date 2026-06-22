import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { Coordinate, Ride } from "../types";
import { duration, km, kmh, shortDate, time } from "../utils/format";

export const RIDE_STORY_WIDTH = 360;
export const RIDE_STORY_HEIGHT = 640;
const ROUTE_WIDTH = 276;
const ROUTE_HEIGHT = 140;

export function RideStoryCard({ ride }: { ride: Ride }) {
  const routeCoordinates = useMemo(() => storyCoordinates(ride), [ride]);
  const routePath = useMemo(() => buildRoutePath(routeCoordinates, ROUTE_WIDTH, ROUTE_HEIGHT), [routeCoordinates]);
  const title = ride.title?.trim() || "My Ride";
  const mood = rideMoodLabel(ride);

  return (
    <View style={styles.story}>
      <View style={styles.orangeBar} />
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>RIDEPULSE</Text>
          <Text numberOfLines={2} adjustsFontSizeToFit style={styles.title}>{title}</Text>
        </View>
        <View style={styles.badge}>
          <Ionicons name="speedometer" size={18} color="#07080a" />
          <Text style={styles.badgeText}>{mood}</Text>
        </View>
      </View>

      <View style={styles.dateRow}>
        <Text style={styles.dateText}>{shortDate(ride.startedAt)}</Text>
        <Text style={styles.dateDot}>/</Text>
        <Text style={styles.dateText}>{time(ride.startedAt)}</Text>
      </View>

      <View style={styles.routePanel}>
        <Svg width={ROUTE_WIDTH} height={ROUTE_HEIGHT} viewBox={`0 0 ${ROUTE_WIDTH} ${ROUTE_HEIGHT}`}>
          {routePath ? (
            <>
              <Path d={routePath} stroke="#2f3744" strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <Path d={routePath} stroke="#19C2FF" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              {routeCoordinates[0] ? (
                <Circle
                  cx={routePoint(routeCoordinates, ROUTE_WIDTH, ROUTE_HEIGHT, 0).x}
                  cy={routePoint(routeCoordinates, ROUTE_WIDTH, ROUTE_HEIGHT, 0).y}
                  r={7}
                  fill="#22c55e"
                />
              ) : null}
              {routeCoordinates.length > 1 ? (
                <Circle
                  cx={routePoint(routeCoordinates, ROUTE_WIDTH, ROUTE_HEIGHT, routeCoordinates.length - 1).x}
                  cy={routePoint(routeCoordinates, ROUTE_WIDTH, ROUTE_HEIGHT, routeCoordinates.length - 1).y}
                  r={8}
                  fill="#facc15"
                />
              ) : null}
            </>
          ) : (
            <Path d="M42 122 C86 58 132 126 178 70 C210 34 238 62 248 46" stroke="#19C2FF" strokeWidth={7} strokeLinecap="round" fill="none" />
          )}
        </Svg>
      </View>

      <View style={styles.routeLabels}>
        <RouteLabel icon="radio-button-on" label="From" value={ride.startLabel} />
        <RouteLabel icon="flag" label="To" value={ride.endLabel} />
      </View>

      <View style={styles.statsGrid}>
        <StoryStat label="Distance" value={km(ride.distanceM)} />
        <StoryStat label="Duration" value={duration(ride.durationS)} />
        <StoryStat label="Top speed" value={kmh(ride.topSpeedKmh)} />
        <StoryStat label="Average" value={kmh(ride.avgSpeedKmh)} />
      </View>

      <View style={styles.footer}>
        <View style={styles.footerLine} />
        <Text style={styles.footerText}>Tracked with RidePulse</Text>
      </View>
    </View>
  );
}

function RouteLabel({
  icon,
  label,
  value
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.routeLabel}>
      <Ionicons name={icon} color="#82DCFF" size={15} />
      <View style={styles.routeLabelText}>
        <Text style={styles.routeLabelTitle}>{label}</Text>
        <Text numberOfLines={2} style={styles.routeLabelValue}>{value || "Unknown point"}</Text>
      </View>
    </View>
  );
}

function StoryStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={styles.statValue}>{value}</Text>
    </View>
  );
}

function storyCoordinates(ride: Ride) {
  const points = ride.points?.length ? ride.points : [
    { latitude: ride.startLatitude, longitude: ride.startLongitude },
    { latitude: ride.endLatitude, longitude: ride.endLongitude }
  ];
  return sampleCoordinates(normalizeCoordinates(points), 90);
}

function normalizeCoordinates(coordinates: Coordinate[]) {
  return coordinates.filter((coordinate) =>
    Number.isFinite(Number(coordinate.latitude)) && Number.isFinite(Number(coordinate.longitude))
  );
}

function sampleCoordinates<T>(coordinates: T[], maxPoints: number) {
  if (coordinates.length <= maxPoints) {
    return coordinates;
  }

  const sampled: T[] = [];
  const step = (coordinates.length - 1) / (maxPoints - 1);
  for (let index = 0; index < maxPoints; index += 1) {
    sampled.push(coordinates[Math.round(index * step)]);
  }
  return sampled;
}

function buildRoutePath(coordinates: Coordinate[], width: number, height: number) {
  if (coordinates.length < 2) {
    return "";
  }

  return coordinates
    .map((_, index) => {
      const point = routePoint(coordinates, width, height, index);
      return `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    })
    .join(" ");
}

function routePoint(coordinates: Coordinate[], width: number, height: number, index: number) {
  const projected = projectCoordinates(coordinates);
  const point = projected[index] || projected[0];
  const minX = Math.min(...projected.map((item) => item.x));
  const maxX = Math.max(...projected.map((item) => item.x));
  const minY = Math.min(...projected.map((item) => item.y));
  const maxY = Math.max(...projected.map((item) => item.y));
  const padding = 18;
  const spanX = Math.max(maxX - minX, 0.0001);
  const spanY = Math.max(maxY - minY, 0.0001);
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
  const drawnWidth = spanX * scale;
  const drawnHeight = spanY * scale;
  const offsetX = (width - drawnWidth) / 2;
  const offsetY = (height - drawnHeight) / 2;

  return {
    x: offsetX + (point.x - minX) * scale,
    y: offsetY + (point.y - minY) * scale
  };
}

function projectCoordinates(coordinates: Coordinate[]) {
  const meanLatitude = coordinates.reduce((sum, point) => sum + Number(point.latitude), 0) / coordinates.length;
  const longitudeScale = Math.cos((meanLatitude * Math.PI) / 180) || 1;

  return coordinates.map((point) => ({
    x: Number(point.longitude) * longitudeScale,
    y: -Number(point.latitude)
  }));
}

function rideMoodLabel(ride: Ride) {
  const distanceKm = ride.distanceM / 1000;
  const startHour = new Date(ride.startedAt).getHours();
  if (startHour >= 19 || startHour < 4) {
    return "NIGHT RUN";
  }
  if (startHour < 7) {
    return "DAWN RUN";
  }
  if (distanceKm >= 100) {
    return "LONG RIDE";
  }
  if (ride.topSpeedKmh >= 95) {
    return "FAST RUN";
  }
  return "RIDE STORY";
}

const styles = StyleSheet.create({
  story: {
    width: RIDE_STORY_WIDTH,
    height: RIDE_STORY_HEIGHT,
    backgroundColor: "#080B0F",
    overflow: "hidden",
    padding: 24
  },
  orangeBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 10,
    backgroundColor: "#19C2FF"
  },
  header: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12
  },
  brand: {
    color: "#82DCFF",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0
  },
  title: {
    color: "#f7f7f4",
    fontSize: 31,
    lineHeight: 35,
    fontWeight: "900",
    width: 206,
    marginTop: 6
  },
  badge: {
    minWidth: 84,
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: "#facc15",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 8
  },
  badgeText: {
    color: "#03151D",
    fontSize: 9,
    fontWeight: "900"
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12
  },
  dateText: {
    color: "#d7d9df",
    fontSize: 14,
    fontWeight: "800"
  },
  dateDot: {
    color: "#19C2FF",
    fontWeight: "900"
  },
  routePanel: {
    width: 312,
    height: 176,
    marginTop: 18,
    borderRadius: 8,
    backgroundColor: "#11161D",
    borderWidth: 1,
    borderColor: "#25303B",
    alignItems: "center",
    justifyContent: "center"
  },
  routeLabels: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12
  },
  routeLabel: {
    width: 151,
    minHeight: 62,
    borderRadius: 8,
    backgroundColor: "#11161D",
    borderColor: "#25303B",
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10
  },
  routeLabelText: {
    flex: 1,
    minWidth: 0
  },
  routeLabelTitle: {
    color: "#8f98a8",
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  routeLabelValue: {
    color: "#f7f7f4",
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "800",
    marginTop: 2
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12
  },
  stat: {
    width: 151,
    minHeight: 56,
    borderRadius: 8,
    backgroundColor: "#18212B",
    borderColor: "#374555",
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 12
  },
  statLabel: {
    color: "#8f98a8",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  statValue: {
    color: "#f7f7f4",
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "900",
    marginTop: 3
  },
  footer: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 16,
    gap: 8
  },
  footerLine: {
    height: 2,
    backgroundColor: "#19C2FF"
  },
  footerText: {
    color: "#8f98a8",
    fontSize: 11,
    fontWeight: "800",
    textAlign: "right"
  }
});
