import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Stop } from "react-native-svg";
import { useTheme } from "../theme/ThemeContext";
import { Coordinate } from "../types";

type Props = {
  coordinates?: Coordinate[];
  start?: Coordinate | null;
  end?: Coordinate | null;
  height?: number;
  style?: ViewStyle;
};

export function RouteArtwork({ coordinates, start, end, height = 210, style }: Props) {
  const { colors } = useTheme();
  const route = useMemo(() => normalizeRoute(coordinates, start, end), [coordinates, start, end]);
  const drawing = useMemo(() => routePath(route), [route]);

  return (
    <View accessibilityLabel="Stylized ride route" style={[styles.shell, { height, backgroundColor: colors.surface }, style]}>
      <LinearGradient
        colors={[`${colors.blue}30`, colors.surfaceHigh, `${colors.accent}16`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.road, styles.roadOne, { backgroundColor: colors.border }]} />
      <View style={[styles.road, styles.roadTwo, { backgroundColor: colors.border }]} />
      <Svg width="100%" height="100%" viewBox="0 0 320 180">
        <Defs>
          <SvgGradient id="route" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.blue} />
            <Stop offset="1" stopColor={colors.accent} />
          </SvgGradient>
        </Defs>
        <Path d={drawing.path} fill="none" stroke={`${colors.background}88`} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
        <Path d={drawing.path} fill="none" stroke="url(#route)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={drawing.start.x} cy={drawing.start.y} r="5" fill={colors.blue} stroke={colors.text} strokeWidth="2" />
        <Circle cx={drawing.end.x} cy={drawing.end.y} r="7" fill={colors.accent} stroke={colors.background} strokeWidth="3" />
      </Svg>
    </View>
  );
}

function normalizeRoute(coordinates?: Coordinate[], start?: Coordinate | null, end?: Coordinate | null) {
  const valid = (coordinates || []).filter(isCoordinate).slice(0, 80);
  if (valid.length >= 2) return valid;
  const fallback = [start, end].filter(isCoordinate) as Coordinate[];
  if (fallback.length >= 2) return fallback;
  return [
    { latitude: 0, longitude: 0 },
    { latitude: 0.18, longitude: 0.12 },
    { latitude: -0.05, longitude: 0.3 },
    { latitude: 0.22, longitude: 0.46 }
  ];
}

function routePath(route: Coordinate[]) {
  const lats = route.map((point) => point.latitude);
  const lons = route.map((point) => point.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const latSpan = Math.max(maxLat - minLat, 0.00001);
  const lonSpan = Math.max(maxLon - minLon, 0.00001);
  const points = route.map((point) => ({
    x: 28 + ((point.longitude - minLon) / lonSpan) * 264,
    y: 152 - ((point.latitude - minLat) / latSpan) * 124
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
  shell: { overflow: "hidden", borderRadius: 24 },
  road: { position: "absolute", height: 1, width: "130%", opacity: 0.55 },
  roadOne: { top: "34%", left: "-12%", transform: [{ rotate: "-13deg" }] },
  roadTwo: { bottom: "24%", left: "-8%", transform: [{ rotate: "9deg" }] }
});
