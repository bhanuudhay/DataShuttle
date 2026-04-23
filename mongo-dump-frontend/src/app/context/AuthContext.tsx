"use client";

import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8003";

function getTokenExp(tok: string): number | null {
  try {
    const payload = JSON.parse(atob(tok.split(".")[1]));
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message: string }>;
  signup: (name: string, email: string, password: string) => Promise<{ success: boolean; message: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }
  }, []);

  const scheduleAutoLogout = useCallback((tok: string) => {
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    const exp = getTokenExp(tok);
    if (!exp) return;
    const msLeft = exp * 1000 - Date.now();
    if (msLeft <= 0) {
      clear();
      return;
    }
    logoutTimerRef.current = setTimeout(() => clear(), msLeft);
  }, [clear]);

  useEffect(() => {
    const savedToken = localStorage.getItem("token");
    const savedUser = localStorage.getItem("user");
    if (savedToken && savedUser) {
      const exp = getTokenExp(savedToken);
      if (exp && exp * 1000 <= Date.now()) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
      } else {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
        scheduleAutoLogout(savedToken);
      }
    }
    setLoading(false);
  }, [scheduleAutoLogout]);

  function persist(tok: string, usr: User) {
    setToken(tok);
    setUser(usr);
    localStorage.setItem("token", tok);
    localStorage.setItem("user", JSON.stringify(usr));
    scheduleAutoLogout(tok);
  }

  async function login(email: string, password: string) {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (data.success && data.token) {
      persist(data.token, data.user);
    }
    return { success: data.success, message: data.message };
  }

  async function signup(name: string, email: string, password: string) {
    const res = await fetch(`${API_URL}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (data.success && data.token) {
      persist(data.token, data.user);
    }
    return { success: data.success, message: data.message };
  }

  async function logout() {
    if (token) {
      try {
        await fetch(`${API_URL}/api/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // server unreachable — clear locally anyway
      }
    }
    clear();
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
