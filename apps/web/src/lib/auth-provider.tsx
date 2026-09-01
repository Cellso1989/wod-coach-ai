import { useEffect, useState, type ReactNode } from "react";
import { api } from "./api.js";
import { AuthContext, type AuthContextValue } from "./auth-context.js";
import type { PublicUser } from "./api.js";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const { user } = await api.login({ email, password });
    setUser(user);
  }

  async function register(name: string, email: string, password: string) {
    const { user } = await api.register({ name, email, password });
    setUser(user);
  }

  async function logout() {
    await api.logout();
    setUser(null);
  }

  const value: AuthContextValue = { user, loading, login, register, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
