export type AppThemeMode = "graphite" | "oled";

const graphiteColors = {
  background: "#080A0C",
  surface: "#111419",
  surfaceHigh: "#181C22",
  elevated: "#20262E",
  accent: "#C8FF5A",
  accentSoft: "#E2FFA7",
  onAccent: "#101606",
  text: "#F5F2EA",
  textSoft: "#DAD8D1",
  muted: "#979DA6",
  border: "#232830",
  borderStrong: "#343B46",
  danger: "#FF626B",
  success: "#55D6A5",
  blue: "#67A7FF",
  yellow: "#FFC857",
  overlay: "rgba(8, 10, 12, 0.94)",
  // Compatibility aliases for components that have not moved to semantic names yet.
  orange: "#C8FF5A",
  orangeSoft: "#E2FFA7"
};

export type ThemeColors = typeof graphiteColors;

const oledColors: ThemeColors = {
  ...graphiteColors,
  background: "#000000",
  surface: "#090B0E",
  surfaceHigh: "#111419",
  elevated: "#191E24",
  border: "#1D2229",
  borderStrong: "#303741",
  overlay: "rgba(0, 0, 0, 0.94)"
};

export const themes: Record<AppThemeMode, ThemeColors> = {
  graphite: graphiteColors,
  oled: oledColors
};

export const colors = themes.graphite;

export const layout = {
  screenPadding: 20,
  sectionGap: 24,
  cardRadius: 24,
  controlRadius: 18,
  compactRadius: 14,
  minTouchTarget: 44
} as const;

export const motion = {
  fast: 140,
  standard: 200,
  relaxed: 280
} as const;

export const typography = {
  regular: "Manrope_400Regular",
  medium: "Manrope_500Medium",
  semibold: "Manrope_600SemiBold",
  bold: "Manrope_700Bold",
  extraBold: "Manrope_800ExtraBold"
} as const;
