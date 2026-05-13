import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, clearToken, readToken, saveToken } from "../api/client";
import { User } from "../types";

type AuthContextValue = {
  token: string | null;
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function bootstrap() {
      try {
        const storedToken = await readToken();
        if (!storedToken) {
          return;
        }
        setToken(storedToken);
        const response = await api<{ user: User }>("/auth/me");
        setUser(response.user);
      } catch {
        await clearToken();
        setToken(null);
      } finally {
        setLoading(false);
      }
    }

    bootstrap();
  }, []);

  async function completeAuth(response: { token: string; user: User }) {
    await saveToken(response.token);
    setToken(response.token);
    setUser(response.user);
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
      register: async (email, password, name) => {
        const response = await api<{ token: string; user: User }>("/auth/register", {
          method: "POST",
          body: JSON.stringify({ email, password, name, bikeModel: "KTM Duke 250 Gen 3" })
        });
        await completeAuth(response);
      },
      logout: async () => {
        await clearToken();
        setToken(null);
        setUser(null);
      }
    }),
    [loading, token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return value;
}
