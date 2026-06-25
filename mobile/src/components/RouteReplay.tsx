import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Stop } from "react-native-svg";
import { typography } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { Coordinate } from "../types";

export function RouteReplay({
  coordinates,
  title = "Route replay"
}: {
  coordinates?: Coordinate[];
  title?: string;
}) {
  const { colors } = useTheme();
  const drawing = useMemo(() => buildDrawing(coordinates || []), [coordinates]);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.header}>
        <Text style={[styles.kicker, { color: colors.blue }]}>REPLAY</Text>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      </View>
      <Svg width="100%" height={170} viewBox="0 0 320 170">
        <Defs>
          <SvgGradient id="replayRoute" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.blue} />
            <Stop offset="0.62" stopColor={colors.text} />
            <Stop offset="1" stopColor={colors.accent} />
          </SvgGradient>
        </Defs>
        <Path d={drawing.path} fill="none" stroke={colors.border} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
        <Path d={drawing.path} fill="none" stroke="url(#replayRoute)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={drawing.start.x} cy={drawing.start.y} r={5} fill={colors.blue} />
        <Circle cx={drawing.end.x} cy={drawing.end.y} r={8} fill={colors.accent} stroke={colors.background} strokeWidth={3} />
      </Svg>
      <Text style={[styles.meta, { color: colors.muted }]}>A compact visual playback of the GPS trace. Exact turn guidance is not inferred.</Text>
    </View>
  );
}

function buildDrawing(coordinates: Coordinate[]) {
  const valid = coordinates.filter(isCoordinate).slice(0, 120);
  const route = valid.length >= 2 ? valid : [
    { latitude: 0, longitude: 0 },
    { latitude: 0.1, longitude: 0.18 },
    { latitude: -0.04, longitude: 0.34 },
    { latitude: 0.18, longitude: 0.52 }
  ];
  const lats = route.map((point) => point.latitude);
  const lons = route.map((point) => point.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const latSpan = Math.max(maxLat - minLat, 0.00001);
  const lonSpan = Math.max(maxLon - minLon, 0.00001);
  const points = route.map((point) => ({
    x: 24 + ((point.longitude - minLon) / lonSpan) * 272,
    y: 146 - ((point.latitude - minLat) / latSpan) * 122
  }));
  return {
    path: points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" "),
    start: points[0],
    end: points[points.length - 1]
  };
}

function isCoordinate(value?: Coordinate | null): value is Coordinate {
  const latitude = Number(value?.latitude);
  const longitude = Number(value?.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}

const styles = StyleSheet.create({
  card: { borderRadius: 28, padding: 16, overflow: "hidden" },
  header: { gap: 2 },
  kicker: { fontFamily: typography.bold, fontSize: 10, letterSpacing: 1.35 },
  title: { fontFamily: typography.extraBold, fontSize: 20 },
  meta: { fontFamily: typography.regular, fontSize: 12, lineHeight: 18, marginTop: -4 }
});
