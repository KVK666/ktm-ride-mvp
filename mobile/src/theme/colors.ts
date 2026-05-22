export type AppThemeMode = "ktm" | "universal";

export type ThemeColors = typeof ktmColors;

const ktmColors = {
  background: "#07080a",
  surface: "#111318",
  surfaceHigh: "#1a1d24",
  elevated: "#20242c",
  orange: "#ff6a00",
  orangeSoft: "#ff9345",
  text: "#f7f7f4",
  textSoft: "#d7d9df",
  muted: "#8f98a8",
  border: "#272c35",
  borderStrong: "#39404d",
  danger: "#ef4444",
  success: "#22c55e",
  blue: "#38bdf8",
  yellow: "#facc15",
  overlay: "rgba(7, 8, 10, 0.88)"
};

const universalColors: ThemeColors = {
  background: "#0b1020",
  surface: "#111827",
  surfaceHigh: "#1f2937",
  elevated: "#263244",
  orange: "#3b82f6",
  orangeSoft: "#60a5fa",
  text: "#f8fafc",
  textSoft: "#e2e8f0",
  muted: "#94a3b8",
  border: "#273449",
  borderStrong: "#3b4a61",
  danger: "#f43f5e",
  success: "#10b981",
  blue: "#06b6d4",
  yellow: "#f59e0b",
  overlay: "rgba(11, 16, 32, 0.9)"
};

export const themes: Record<AppThemeMode, ThemeColors> = {
  ktm: ktmColors,
  universal: universalColors
};

export const colors = themes.ktm;
