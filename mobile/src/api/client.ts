import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { MIRRORED_TOKEN_KEY } from "../services/trackingKeys";

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "http://10.0.2.2:4000/api";

const TOKEN_KEY = "duke_ride_token";

export async function saveToken(token: string) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await AsyncStorage.setItem(MIRRORED_TOKEN_KEY, token);
}

export async function readToken() {
  return (await SecureStore.getItemAsync(TOKEN_KEY)) || AsyncStorage.getItem(MIRRORED_TOKEN_KEY);
}

export async function clearToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await AsyncStorage.removeItem(MIRRORED_TOKEN_KEY);
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await readToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("Request timed out. Check backend connection.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(body.error || "Request failed");
  }

  return body as T;
}
