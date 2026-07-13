import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Stop } from "react-native-svg";
import { typography } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { Coordinate } from "../types";
import { buildRouteDrawing, normalizeBoundedCoordinates } from "../utils/coordinates";

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
  const valid = normalizeBoundedCoordinates(coordinates).slice(0, 120);
  const route = valid.length >= 2 ? valid : [
    { latitude: 0, longitude: 0 },
    { latitude: 0.1, longitude: 0.18 },
    { latitude: -0.04, longitude: 0.34 },
    { latitude: 0.18, longitude: 0.52 }
  ];
  return buildRouteDrawing(route, { left: 24, bottom: 146, width: 272, height: 122 });
}

const styles = StyleSheet.create({
  card: { borderRadius: 28, padding: 16, overflow: "hidden" },
  header: { gap: 2 },
  kicker: { fontFamily: typography.bold, fontSize: 10, letterSpacing: 1.35 },
  title: { fontFamily: typography.extraBold, fontSize: 20 },
  meta: { fontFamily: typography.regular, fontSize: 12, lineHeight: 18, marginTop: -4 }
});
