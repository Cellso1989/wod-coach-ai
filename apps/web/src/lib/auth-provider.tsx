import { useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from './api.js';
import { AuthContext, type AuthContextValue } from './auth-context.js';
import type { PublicUser } from './api.js';
import { disablePushNotifications } from './push-notifications.js';

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

  useEffect(() => {
    const denied = (event: Event) => {
      sessionStorage.setItem('access-message', (event as CustomEvent<string>).detail);
      setUser(null);
    };
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      void api
        .me()
        .then(({ user }) => setUser(user))
        .catch((error: unknown) => {
          if (error instanceof ApiError && (error.status === 401 || error.status === 403))
            setUser(null);
        });
    };
    window.addEventListener('access-denied', denied);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('access-denied', denied);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  async function login(email: string, password: string) {
    const { user } = await api.login({ email, password });
    setUser(user);
  }

  async function register(name: string, email: string, password: string) {
    await api.register({ name, email, password });
  }

  async function logout() {
    await disablePushNotifications().catch(() => {});
    await api.logout();
    setUser(null);
  }

  const value: AuthContextValue = { user, loading, login, register, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
