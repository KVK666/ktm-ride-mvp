import AsyncStorage from "@react-native-async-storage/async-storage";

export const ONBOARDING_SEEN_KEY = "duke_ride_onboarding_seen_v1";

export async function hasSeenOnboarding() {
  return (await AsyncStorage.getItem(ONBOARDING_SEEN_KEY)) === "true";
}

export async function markOnboardingSeen() {
  await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, "true");
}
