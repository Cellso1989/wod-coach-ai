import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, X } from 'lucide-react';
import { api, type NotificationFeed } from '../lib/api.js';
import { useAuth } from '../lib/auth-context.js';
import {
  disablePushNotifications,
  enablePushNotifications,
  hasPushSubscription,
  supportsPush,
} from '../lib/push-notifications.js';

export function NotificationCenter() {
  const { user } = useAuth();
  const [feed, setFeed] = useState<NotificationFeed | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushAvailable, setPushAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    let loading = false;
    const refresh = async () => {
      if (document.hidden || loading) return;
      loading = true;
      try {
        const data = await api.getNotifications(controller.signal);
        if (!controller.signal.aborted) {
          setFeed(data);
          setError('');
        }
      } catch {
        if (!controller.signal.aborted) setError('Não foi possível carregar os avisos.');
      } finally {
        loading = false;
      }
    };
    void refresh();
    if (supportsPush()) {
      void api
        .getPushConfig()
        .then(({ publicKey }) => {
          if (!controller.signal.aborted) setPushAvailable(!!publicKey);
        })
        .catch(() => {});
      void hasPushSubscription()
        .then((enabled) => {
          if (!controller.signal.aborted) setPushEnabled(enabled);
        })
        .catch(() => {});
    }
    const timer = window.setInterval(() => {
      void refresh();
    }, 30_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('ranking-participation-changed', refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('ranking-participation-changed', refresh);
    };
  }, [user, attempt]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  if (!user || feed?.enabled === false) return null;

  async function markRead(ids?: string[]) {
    if (ids && !ids.length) return;
    try {
      if (ids) await api.markNotificationsRead(ids);
      else await api.markAllNotificationsRead();
      setAttempt((value) => value + 1);
    } catch {
      setError('Não foi possível marcar os avisos como lidos.');
    }
  }

  async function togglePush() {
    setBusy(true);
    setError('');
    try {
      if (pushEnabled) await disablePushNotifications();
      else await enablePushNotifications();
      setPushEnabled(!pushEnabled);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Não foi possível alterar os avisos no celular.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-label={`Notificações${feed?.unreadCount ? `: ${feed.unreadCount} não lidas` : ''}`}
        aria-expanded={open}
        aria-controls="ranking-notifications"
        onClick={() => setOpen(!open)}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-100 hover:border-orange-700"
      >
        <Bell size={18} aria-hidden="true" />
        {!!feed?.unreadCount && (
          <span className="absolute -right-1 -top-1 rounded-full bg-orange-600 px-1.5 text-[10px] font-bold text-white">
            {feed.unreadCount > 99 ? '99+' : feed.unreadCount}
          </span>
        )}
      </button>
      {open && (
        <section
          id="ranking-notifications"
          aria-label="Notificações do ranking"
          className="absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-neutral-800 bg-neutral-950 p-4 text-neutral-100 shadow-xl"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Notificações</h2>
            <button
              type="button"
              aria-label="Fechar notificações"
              onClick={() => setOpen(false)}
              className="rounded p-2"
            >
              <X size={18} />
            </button>
          </div>
          {error && (
            <div role="alert" className="my-2 text-sm text-orange-400">
              {error}{' '}
              <button
                type="button"
                className="underline"
                onClick={() => setAttempt((value) => value + 1)}
              >
                Tentar novamente
              </button>
            </div>
          )}
          {!feed && !error && <p className="py-4 text-sm text-neutral-400">Carregando avisos...</p>}
          {feed && !feed.notifications.length && (
            <p className="py-4 text-sm text-neutral-400">
              Quando alguém do ranking registrar um resultado, o aviso aparece aqui.
            </p>
          )}
          {!!feed?.notifications.length && (
            <>
              {!!feed.unreadCount && (
                <button
                  type="button"
                  className="my-2 text-xs text-orange-400"
                  onClick={() => void markRead()}
                >
                  Marcar todas como lidas
                </button>
              )}
              <ul className="max-h-72 space-y-2 overflow-y-auto py-2">
                {feed.notifications.map((item) => (
                  <li key={item.id}>
                    <Link
                      to="/ranking"
                      onClick={() => {
                        if (!item.readAt) void markRead([item.id]);
                        setOpen(false);
                      }}
                      className={`block rounded-lg p-3 text-sm ${item.readAt ? 'bg-neutral-900 text-neutral-400' : 'bg-orange-950/30 text-neutral-100'}`}
                    >
                      <span>{item.message}</span>
                      <time
                        dateTime={item.createdAt}
                        className="mt-1 block text-xs text-neutral-500"
                      >
                        {new Date(item.createdAt).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="mt-3 border-t border-neutral-800 pt-3">
            {pushAvailable ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void togglePush()}
                className="w-full rounded-lg border border-orange-800 px-3 py-2 text-sm text-orange-400 disabled:opacity-50"
              >
                {busy
                  ? 'Aguarde...'
                  : pushEnabled
                    ? 'Desativar avisos neste dispositivo'
                    : 'Ativar avisos neste dispositivo'}
              </button>
            ) : (
              <p className="text-xs text-neutral-500">
                {supportsPush()
                  ? 'Os avisos no celular ainda não estão disponíveis.'
                  : 'Para receber avisos no celular, use um navegador compatível. No iPhone, adicione o app à tela inicial.'}
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
