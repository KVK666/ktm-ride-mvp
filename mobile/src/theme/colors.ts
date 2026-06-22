export type AppThemeMode = "graphite" | "oled";

const graphiteColors = {
  background: "#080B0F",
  surface: "#11161D",
  surfaceHigh: "#18212B",
  elevated: "#202B36",
  accent: "#19C2FF",
  accentSoft: "#82DCFF",
  onAccent: "#03151D",
  text: "#F5F7FA",
  textSoft: "#D8DEE7",
  muted: "#8C99A8",
  border: "#25303B",
  borderStrong: "#374555",
  danger: "#F45B69",
  success: "#2DD4A7",
  blue: "#7C8CFF",
  yellow: "#F4B942",
  overlay: "rgba(8, 11, 15, 0.92)",
  // Compatibility aliases for components that have not moved to semantic names yet.
  orange: "#19C2FF",
  orangeSoft: "#82DCFF"
};

export type ThemeColors = typeof graphiteColors;

const oledColors: ThemeColors = {
  ...graphiteColors,
  background: "#000000",
  surface: "#090D11",
  surfaceHigh: "#111820",
  elevated: "#18212B",
  border: "#1E2933",
  borderStrong: "#334250",
  overlay: "rgba(0, 0, 0, 0.94)"
};

export const themes: Record<AppThemeMode, ThemeColors> = {
  graphite: graphiteColors,
  oled: oledColors
};

export const colors = themes.graphite;

export const layout = {
  screenPadding: 18,
  sectionGap: 20,
  cardRadius: 18,
  controlRadius: 16,
  compactRadius: 12,
  minTouchTarget: 44
} as const;

export const motion = {
  fast: 120,
  standard: 180,
  relaxed: 240
} as const;
