import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, tokenStore, UNAUTHORIZED_EVENT } from "@/api/client";
import type { TokenOut, User } from "@/api/types";

interface AuthState {
  user: User | null;
  /** true mientras se valida un token existente con /auth/me */
  loading: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<User>;
  acceptSession: (t: TokenOut) => void;
  logout: () => void;
}

const AuthContext = React.createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState<boolean>(() => !!tokenStore.get());

  const logout = React.useCallback(() => {
    tokenStore.set(null);
    setUser(null);
    qc.clear();
  }, [qc]);

  React.useEffect(() => {
    if (!tokenStore.get()) return;
    let cancelled = false;
    api<User>("/auth/me")
      .then((u) => !cancelled && setUser(u))
      .catch(() => !cancelled && tokenStore.set(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    const h = () => logout();
    window.addEventListener(UNAUTHORIZED_EVENT, h);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, h);
  }, [logout]);

  const acceptSession = React.useCallback((t: TokenOut) => {
    tokenStore.set(t.access_token);
    setUser(t.user);
    setLoading(false);
  }, []);

  const login = React.useCallback(
    async (email: string, password: string) => {
      const t = await api<TokenOut>("/auth/login", { method: "POST", body: { email, password } });
      acceptSession(t);
      return t.user;
    },
    [acceptSession],
  );

  const value = React.useMemo<AuthState>(
    () => ({ user, loading, isAdmin: user?.role === "admin", login, logout, acceptSession }),
    [user, loading, login, logout, acceptSession],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth fuera de AuthProvider");
  return ctx;
}

/** Permite inyectar un estado de autenticación en pruebas. */
export const AuthContextForTests = AuthContext;
