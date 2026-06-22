import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { StyleSheet } from "react-native";
import { AppThemeMode, ThemeColors, themes } from "./colors";

const THEME_MODE_KEY = "duke_ride_theme_mode";

type ThemeContextValue = {
  mode: AppThemeMode;
  colors: ThemeColors;
  setMode: (mode: AppThemeMode) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue>({
  mode: "graphite",
  colors: themes.graphite,
  setMode: async () => {}
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setThemeMode] = useState<AppThemeMode>("graphite");

  useEffect(() => {
    AsyncStorage.getItem(THEME_MODE_KEY)
      .then((stored) => {
        if (stored === "graphite" || stored === "oled") {
          setThemeMode(stored);
          return;
        }
        if (stored === "ktm" || stored === "universal") {
          const migratedMode: AppThemeMode = stored === "ktm" ? "graphite" : "oled";
          setThemeMode(migratedMode);
          AsyncStorage.setItem(THEME_MODE_KEY, migratedMode).catch(() => {});
        }
      })
      .catch(() => {
        // Theme persistence should never block the app from opening.
      });
  }, []);

  const setMode = useCallback(async (nextMode: AppThemeMode) => {
    setThemeMode(nextMode);
    try {
      await AsyncStorage.setItem(THEME_MODE_KEY, nextMode);
    } catch {
      // Keep the in-memory theme even if local persistence is unavailable.
    }
  }, []);

  const value = useMemo(
    () => ({
      mode,
      colors: themes[mode],
      setMode
    }),
    [mode, setMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function useThemedStyles<T>(createStyles: (colors: ThemeColors) => T): any {
  const { colors } = useTheme();
  return useMemo(() => StyleSheet.create(createStyles(colors) as any), [colors, createStyles]);
}
