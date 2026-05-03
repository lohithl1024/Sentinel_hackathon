// this is team z
import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL as string;
const TOKEN_KEY = "ueba_token";

export type User = { id: string; email: string; name?: string; role?: string; shift?: string };

type AuthCtx = {
  user: User | null | undefined;
  token: string | null;
  login: (email: string, password: string, simulate?: string[]) => Promise<any>;
  verifyOtp: (eventId: string, otp: string) => Promise<any>;
  register: (email: string, password: string, name?: string, role?: string, shift?: string) => Promise<any>;
  logout: () => Promise<void>;
  setAuth: (token: string, user: User) => Promise<void>;
};

const Ctx = createContext<AuthCtx>({} as any);
export const useAuth = () => useContext(Ctx);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const t = await AsyncStorage.getItem(TOKEN_KEY);
      if (!t) { setUser(null); return; }
      try {
        const res = await fetch(`${BACKEND}/api/auth/me`, {
          headers: { Authorization: `Bearer ${t}` },
        });
        if (res.ok) {
          const u = await res.json();
          setToken(t); setUser(u);
        } else {
          await AsyncStorage.removeItem(TOKEN_KEY);
          setUser(null);
        }
      } catch { setUser(null); }
    })();
  }, []);

  const setAuth = async (t: string, u: User) => {
    await AsyncStorage.setItem(TOKEN_KEY, t);
    setToken(t); setUser(u);
  };

  const login = async (email: string, password: string, simulate?: string[]) => {
    const res = await fetch(`${BACKEND}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, simulate }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Login failed");
    if (data.action === "ALLOW" && data.token) {
      await setAuth(data.token, data.user);
    }
    return data;
  };

  const verifyOtp = async (eventId: string, otp: string) => {
    const res = await fetch(`${BACKEND}/api/auth/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: eventId, otp }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "OTP failed");
    await setAuth(data.token, data.user);
    return data;
  };

  const register = async (email: string, password: string, name?: string, role?: string, shift?: string) => {
    const res = await fetch(`${BACKEND}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name, role, shift }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Registration failed");
    await setAuth(data.token, data.user);
    return data;
  };

  const logout = async () => {
    await AsyncStorage.removeItem(TOKEN_KEY);
    setToken(null); setUser(null);
  };

  return (
    <Ctx.Provider value={{ user, token, login, verifyOtp, register, logout, setAuth }}>
      {children}
    </Ctx.Provider>
  );
};

export async function apiGet(path: string, token: string | null) {
  const res = await fetch(`${BACKEND}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return res.json();
}

export async function apiPost(path: string, body: any, token: string | null) {
  const res = await fetch(`${BACKEND}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || `POST ${path} failed`);
  return data;
}

export async function apiUpload(path: string, form: FormData, token: string | null) {
  const res = await fetch(`${BACKEND}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || `UPLOAD ${path} failed`);
  return data;
}

export async function apiGetPublic(path: string) {
  const res = await fetch(`${BACKEND}${path}`);
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return res.json();
}
