import AsyncStorage from "@react-native-async-storage/async-storage";

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

  try {
    const stored = await AsyncStorage.getItem(storageKey(userId));
    const parsed = Number(stored);
    return isValidMonthlyDistanceGoal(parsed) ? parsed : DEFAULT_MONTHLY_DISTANCE_GOAL_KM;
  } catch {
    return DEFAULT_MONTHLY_DISTANCE_GOAL_KM;
  }
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

  const normalized = Math.round(goalKm * 10) / 10;
  await AsyncStorage.setItem(storageKey(userId), String(normalized));
  return normalized;
}

export function isValidMonthlyDistanceGoal(value: number) {
  return (
    Number.isFinite(value) &&
    value >= MIN_MONTHLY_DISTANCE_GOAL_KM &&
    value <= MAX_MONTHLY_DISTANCE_GOAL_KM
  );
}
