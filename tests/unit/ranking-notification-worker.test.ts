import fs from 'node:fs';
import vm from 'node:vm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('notification service worker', () => {
  const listeners: Record<string, (event: unknown) => void> = {};
  const showNotification = vi.fn();
  const fetch = vi.fn();
  const navigate = vi.fn();
  const focus = vi.fn();
  const openWindow = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        enabled: true,
        notifications: [{ id: 'notice', message: 'Fulano registrou um resultado 👀' }],
      }),
    });
    vm.runInNewContext(
      fs.readFileSync(new URL('../../apps/web/public/sw.js', import.meta.url), 'utf8'),
      {
        URL,
        fetch,
        self: {
          addEventListener: (name: string, listener: (event: unknown) => void) => {
            listeners[name] = listener;
          },
          registration: { showNotification },
          location: { origin: 'https://wod.example.com' },
          clients: {
            matchAll: async () => [{ url: 'https://wod.example.com/wods', navigate, focus }],
            openWindow,
          },
        },
      },
    );
  });
  const push = async (payload: object) => {
    let work: Promise<void> | undefined;
    listeners.push!({
      data: { json: () => payload },
      waitUntil: (promise: Promise<void>) => {
        work = promise;
      },
    });
    await work;
  };
  it('uses the authenticated account’s safe message rather than arbitrary push score contents', async () => {
    await push({ tag: 'notice', body: '12:34', timeSeconds: 754, url: '/wods/private' });
    expect(showNotification).toHaveBeenCalledWith('WOD Coach AI', {
      body: 'Fulano registrou um resultado 👀',
      icon: '/icon-192.png',
      tag: 'notice',
      data: { url: '/ranking' },
    });
    expect(fetch).toHaveBeenCalledWith('/api/notifications', {
      credentials: 'include',
      cache: 'no-store',
    });
  });
  it('discards pushes for another account, nonparticipants and logged-out sessions', async () => {
    await push({ tag: 'another-account-notice' });
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: false, notifications: [] }),
    });
    await push({ tag: 'notice' });
    fetch.mockResolvedValue({ ok: false });
    await push({ tag: 'notice' });
    fetch.mockRejectedValue(new Error('offline'));
    await push({ tag: 'notice' });
    expect(showNotification).not.toHaveBeenCalled();
  });
  it('always navigates to the ranking on click and focuses an existing app window', async () => {
    let work: Promise<void> | undefined;
    const close = vi.fn();
    listeners.notificationclick!({
      notification: { close, data: { url: 'https://evil.test' } },
      waitUntil: (promise: Promise<void>) => {
        work = promise;
      },
    });
    await work;
    expect(close).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('https://wod.example.com/ranking');
    expect(focus).toHaveBeenCalled();
    expect(openWindow).not.toHaveBeenCalled();
  });
});
