import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, clearApiReadCache, setApiReadSession } from './api.js';
import { AuthContext, type AuthContextValue } from './auth-context.js';
import type { PublicUser } from './api.js';
import { disablePushNotifications } from './push-notifications.js';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const sessionRevision = useRef(0);

  useEffect(() => {
    let active = true;
    const revision = sessionRevision.current;
    api
      .me()
      .then(({ user }) => {
        if (!active || revision !== sessionRevision.current) return;
        setApiReadSession(user.id);
        setUser(user);
      })
      .catch(() => {
        if (!active || revision !== sessionRevision.current) return;
        setApiReadSession(null);
        setUser(null);
      })
      .finally(() => {
        if (active && revision === sessionRevision.current) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const denied = (event: Event) => {
      sessionRevision.current++;
      sessionStorage.setItem('access-message', (event as CustomEvent<string>).detail);
      setApiReadSession(null);
      setUser(null);
      setLoading(false);
    };
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      clearApiReadCache();
      const revision = sessionRevision.current;
      void api
        .me()
        .then(({ user }) => {
          if (revision !== sessionRevision.current) return;
          setApiReadSession(user.id);
          setUser(user);
        })
        .catch((error: unknown) => {
          if (revision !== sessionRevision.current) return;
          if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
            setApiReadSession(null);
            setUser(null);
          }
        })
        .finally(() => {
          if (revision === sessionRevision.current) setLoading(false);
        });
    };
    window.addEventListener('access-denied', denied);
    window.addEventListener('focus', clearApiReadCache);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('access-denied', denied);
      window.removeEventListener('focus', clearApiReadCache);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  async function login(email: string, password: string) {
    const revision = ++sessionRevision.current;
    try {
      const { user } = await api.login({ email, password });
      if (revision !== sessionRevision.current) return;
      setApiReadSession(user.id);
      setUser(user);
    } finally {
      if (revision === sessionRevision.current) setLoading(false);
    }
  }

  async function register(name: string, email: string, password: string) {
    await api.register({ name, email, password });
  }

  async function logout() {
    sessionRevision.current++;
    setApiReadSession(null);
    await disablePushNotifications().catch(() => {});
    await api.logout();
    setUser(null);
    setLoading(false);
  }

  const value: AuthContextValue = { user, loading, login, register, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
