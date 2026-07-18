import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  api,
  clearToken,
  isAuthenticationError,
  readToken,
  saveToken,
  subscribeToAuthenticationRejection
} from "../api/client";
import { diagnosticDetails, logDiagnostic } from "../services/diagnostics";
import { syncPendingRidesForCurrentUser } from "../services/autoRideTracking";
import { syncProfilePhotoForUser } from "../services/profilePhoto";
import { User } from "../types";

type AuthContextValue = {
  token: string | null;
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, bikeModel?: string) => Promise<void>;
  updateUser: (patch: Partial<User>) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const CACHED_USER_KEY = "duke_ride_cached_user_v1";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToAuthenticationRejection(() => {
      logDiagnostic({
        level: "warn",
        area: "auth",
        message: "Active session was rejected; clearing authentication"
      });
      Promise.allSettled([
        clearToken(),
        AsyncStorage.removeItem(CACHED_USER_KEY)
      ]).finally(() => {
        setToken(null);
        setUser(null);
      });
    });

    async function bootstrap() {
      try {
        const storedToken = await readToken();
        if (!storedToken) {
          return;
        }
        setToken(storedToken);
        const cachedUser = await readCachedUser();
        if (cachedUser) {
          setUser(cachedUser);
        }
        const response = await api<{ user: User }>("/auth/me");
        setUser(response.user);
        await cacheUser(response.user);
        const profilePhotoMetadata = await syncProfilePhotoForUser(response.user);
        if (profilePhotoMetadata) {
          setUser({ ...response.user, ...profilePhotoMetadata });
        }
        await syncPendingRidesForCurrentUser();
      } catch (err) {
        if (!isAuthenticationError(err)) {
          logDiagnostic({
            level: "warn",
            area: "auth",
            message: "Auth refresh unavailable; keeping the offline session",
            details: diagnosticDetails(err)
          });
          return;
        }
        logDiagnostic({
          level: "warn",
          area: "auth",
          message: "Stored session was rejected; clearing authentication",
          details: diagnosticDetails(err)
        });
        await clearToken();
        await AsyncStorage.removeItem(CACHED_USER_KEY).catch(() => {});
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    bootstrap();
    return unsubscribe;
  }, []);

  async function completeAuth(response: { token: string; user: User }) {
    await saveToken(response.token);
    setToken(response.token);
    setUser(response.user);
    await cacheUser(response.user);
    const profilePhotoMetadata = await syncProfilePhotoForUser(response.user);
    if (profilePhotoMetadata) {
      setUser({ ...response.user, ...profilePhotoMetadata });
    }
    await syncPendingRidesForCurrentUser();
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      loading,
      login: async (email, password) => {
        const response = await api<{ token: string; user: User }>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password })
        });
        await completeAuth(response);
      },
      register: async (email, password, name, bikeModel) => {
        const response = await api<{ token: string; user: User }>("/auth/register", {
          method: "POST",
          body: JSON.stringify({ email, password, name, bikeModel: bikeModel?.trim() || "Motorcycle" })
        });
        await completeAuth(response);
      },
      updateUser: (patch) => {
        setUser((current) => {
          const next = current ? { ...current, ...patch } : current;
          if (next) cacheUser(next).catch(() => {});
          return next;
        });
      },
      logout: async () => {
        await clearToken();
        await AsyncStorage.removeItem(CACHED_USER_KEY).catch(() => {});
        setToken(null);
        setUser(null);
      }
    }),
    [loading, token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

async function readCachedUser(): Promise<User | null> {
  try {
    const stored = await AsyncStorage.getItem(CACHED_USER_KEY);
    const parsed = stored ? JSON.parse(stored) : null;
    return parsed && typeof parsed.id === "string" && typeof parsed.email === "string" ? parsed as User : null;
  } catch {
    return null;
  }
}

async function cacheUser(user: User) {
  await AsyncStorage.setItem(CACHED_USER_KEY, JSON.stringify(user));
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return value;
}
