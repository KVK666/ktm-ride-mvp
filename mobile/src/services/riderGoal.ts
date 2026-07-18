import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, ApiError } from "../api/client";

const MONTHLY_GOAL_KEY_PREFIX = "ridepulse_monthly_distance_goal_km";

export const DEFAULT_MONTHLY_DISTANCE_GOAL_KM = 300;
export const MIN_MONTHLY_DISTANCE_GOAL_KM = 10;
export const MAX_MONTHLY_DISTANCE_GOAL_KM = 5000;

function storageKey(userId: string) {
  return `${MONTHLY_GOAL_KEY_PREFIX}:${userId}`;
}

export async function getMonthlyDistanceGoalKm(userId?: string | null) {
  if (!userId) {
    return DEFAULT_MONTHLY_DISTANCE_GOAL_KM;
  }

  const stored = await AsyncStorage.getItem(storageKey(userId)).catch(() => null);
  const parsed = Number(stored);
  const localGoal = isValidMonthlyDistanceGoal(parsed)
    ? Math.round(parsed)
    : DEFAULT_MONTHLY_DISTANCE_GOAL_KM;

  try {
    const response = await api<{ preferences?: { monthlyDistanceGoalKm?: number | null } }>("/profile/preferences");
    const rawServerGoal = response.preferences?.monthlyDistanceGoalKm;
    const serverGoal = Number(rawServerGoal);
    if (isValidMonthlyDistanceGoal(serverGoal)) {
      const normalized = Math.round(serverGoal);
      await AsyncStorage.setItem(storageKey(userId), String(normalized));
      return normalized;
    }
    if (rawServerGoal == null) {
      try {
        const migrated = await api<{ preferences?: { monthlyDistanceGoalKm?: number | null } }>("/profile/preferences", {
          method: "PATCH",
          body: JSON.stringify({ monthlyDistanceGoalKm: localGoal })
        });
        const savedGoal = Number(migrated.preferences?.monthlyDistanceGoalKm);
        if (isValidMonthlyDistanceGoal(savedGoal)) {
          const normalized = Math.round(savedGoal);
          await AsyncStorage.setItem(storageKey(userId), String(normalized));
          return normalized;
        }
      } catch {
        // Keep the valid legacy/default goal until migration can be retried.
      }
    }
  } catch {
    // Older/offline backends fall through to the established local preference.
  }
  return localGoal;
}

export async function saveMonthlyDistanceGoalKm(userId: string, goalKm: number) {
  if (!userId) {
    throw new Error("Sign in again before saving your goal.");
  }
  if (!isValidMonthlyDistanceGoal(goalKm)) {
    throw new Error(
      `Choose a goal between ${MIN_MONTHLY_DISTANCE_GOAL_KM.toLocaleString()} and ${MAX_MONTHLY_DISTANCE_GOAL_KM.toLocaleString()} km.`
    );
  }

  const normalized = Math.round(goalKm);
  try {
    const response = await api<{ preferences?: { monthlyDistanceGoalKm?: number | null } }>("/profile/preferences", {
      method: "PATCH",
      body: JSON.stringify({ monthlyDistanceGoalKm: normalized })
    });
    const serverGoal = Number(response.preferences?.monthlyDistanceGoalKm);
    if (isValidMonthlyDistanceGoal(serverGoal)) {
      const normalizedServerGoal = Math.round(serverGoal);
      await AsyncStorage.setItem(storageKey(userId), String(normalizedServerGoal));
      return normalizedServerGoal;
    }
  } catch (error) {
    if (!canUseLocalFallback(error)) {
      throw error;
    }
    // Preserve the local preference when the additive endpoint is unavailable or offline.
  }
  await AsyncStorage.setItem(storageKey(userId), String(normalized));
  return normalized;
}

function canUseLocalFallback(error: unknown) {
  if (error instanceof ApiError) {
    return error.status === 404 || error.status === 405 || error.status === 501;
  }
  return true;
}

export function isValidMonthlyDistanceGoal(value: number) {
  return (
    Number.isFinite(value) &&
    value >= MIN_MONTHLY_DISTANCE_GOAL_KM &&
    value <= MAX_MONTHLY_DISTANCE_GOAL_KM
  );
}
