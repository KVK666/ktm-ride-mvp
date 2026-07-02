import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { diagnosticDetails, logDiagnostic } from "../services/diagnostics";
import { MIRRORED_TOKEN_KEY } from "../services/trackingKeys";

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "http://10.0.2.2:4001/api";

const TOKEN_KEY = "duke_ride_token";

export async function saveToken(token: string) {
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch (error) {
    await logDiagnostic({
      level: "warn",
      area: "auth",
      message: "Secure token save failed; using mirrored storage only",
      details: diagnosticDetails(error)
    });
  }

  try {
    await AsyncStorage.setItem(MIRRORED_TOKEN_KEY, token);
  } catch (error) {
    await logDiagnostic({
      level: "warn",
      area: "auth",
      message: "Mirrored token save failed",
      details: diagnosticDetails(error)
    });
  }
}

export async function readToken() {
  try {
    const secureToken = await SecureStore.getItemAsync(TOKEN_KEY);
    if (secureToken) {
      return secureToken;
    }
  } catch (error) {
    await logDiagnostic({
      level: "warn",
      area: "auth",
      message: "Secure token read failed; trying mirrored storage",
      details: diagnosticDetails(error)
    });
  }

  try {
    return await AsyncStorage.getItem(MIRRORED_TOKEN_KEY);
  } catch (error) {
    await logDiagnostic({
      level: "warn",
      area: "auth",
      message: "Mirrored token read failed",
      details: diagnosticDetails(error)
    });
    return null;
  }
}

export async function clearToken() {
  const results = await Promise.allSettled([
    SecureStore.deleteItemAsync(TOKEN_KEY),
    AsyncStorage.removeItem(MIRRORED_TOKEN_KEY)
  ]);

  const failed = results.find((result) => result.status === "rejected");
  if (failed?.status === "rejected") {
    await logDiagnostic({
      level: "warn",
      area: "auth",
      message: "Token clear partially failed",
      details: diagnosticDetails(failed.reason)
    });
  }
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
    logDiagnostic({
      level: "error",
      area: "api",
      message: `Network failure for ${path}`,
      details: diagnosticDetails(error)
    });
    if (error?.name === "AbortError") {
      throw new Error("Request timed out. Check backend connection.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const text = await readResponseText(response);
  const parsed = parseResponseJson(text);

  if (!response.ok) {
    logDiagnostic({
      level: "error",
      area: "api",
      message: `API ${response.status} for ${path}`,
      details: text
    });
    throw new Error(parsed.valid ? responseErrorMessage(parsed.value) : parsed.error || "Request failed");
  }

  if (!parsed.valid) {
    logDiagnostic({
      level: "error",
      area: "api",
      message: `Invalid JSON response for ${path}`,
      details: text.slice(0, 1200)
    });
    throw new Error("Unexpected response from server");
  }

  return unwrapApiResponse(parsed.value) as T;
}

async function readResponseText(response: Response) {
  try {
    return await response.text();
  } catch (error) {
    logDiagnostic({
      level: "error",
      area: "api",
      message: "API response body could not be read",
      details: diagnosticDetails(error)
    });
    throw new Error("Unable to read server response");
  }
}

function parseResponseJson(text: string): { valid: true; value: any } | { valid: false; error: string } {
  if (!text) {
    return { valid: true, value: {} };
  }

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      return { valid: true, value: parsed };
    }
    return { valid: false, error: "Unexpected response from server" };
  } catch {
    return { valid: false, error: text.slice(0, 180) || "Unexpected response from server" };
  }
}

function unwrapApiResponse(value: any) {
  if (isStandardApiResponse(value)) {
    return value.data ?? {};
  }
  return value;
}

function responseErrorMessage(value: any) {
  if (isStandardApiResponse(value)) {
    return value.message || value.error || "Request failed";
  }
  return value?.error || value?.message || "Request failed";
}

function isStandardApiResponse(value: any) {
  return Boolean(
    value &&
    typeof value === "object" &&
    "status" in value &&
    "programCode" in value &&
    "message" in value &&
    "data" in value
  );
}
