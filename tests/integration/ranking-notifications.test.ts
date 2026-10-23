import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { buildApp } from '../../apps/api/src/app.js';

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  users: vi.fn(),
  wod: vi.fn(),
  previous: vi.fn(),
  save: vi.fn(),
  announcement: vi.fn(),
  notifications: vi.fn(),
  deliveries: vi.fn(),
  feed: vi.fn(),
  count: vi.fn(),
  read: vi.fn(),
  subscription: vi.fn(),
  subscriptionStatus: vi.fn(),
  deleteSubscription: vi.fn(),
  profileSave: vi.fn(),
  deleteNotifications: vi.fn(),
  deleteAnnouncements: vi.fn(),
}));
vi.mock('../../packages/database/dist/index.js', async (original) => {
  const tx = {
    wodResult: { findUnique: mocks.previous, upsert: mocks.save },
    athleteProfile: { findUnique: mocks.profile, upsert: mocks.profileSave },
    user: { findMany: mocks.users },
    resultAnnouncement: { createMany: mocks.announcement, deleteMany: mocks.deleteAnnouncements },
    rankingNotification: {
      createMany: mocks.notifications,
      findMany: mocks.feed,
      count: mocks.count,
      updateMany: mocks.read,
      deleteMany: mocks.deleteNotifications,
    },
    pushDelivery: { createMany: mocks.deliveries },
    pushSubscription: {
      upsert: mocks.subscription,
      findFirst: mocks.subscriptionStatus,
      deleteMany: mocks.deleteSubscription,
    },
  };
  return {
    ...(await original<typeof import('@wod-coach-ai/database')>()),
    prisma: {
      ...tx,
      wod: { findFirst: mocks.wod },
      $transaction: async (work: (db: typeof tx) => Promise<unknown>) => work(tx),
      $disconnect: vi.fn(),
    },
  };
});

describe('ranking result notifications', () => {
  let app: ReturnType<typeof buildApp>;
  let headers: { authorization: string };
  const id = '11111111-1111-4111-8111-111111111111';
  beforeEach(async () => {
    vi.resetAllMocks();
    app = buildApp();
    await app.ready();
    const unsigned = [{ alg: 'HS256', typ: 'JWT' }, { sub: 'actor' }]
      .map((item) => Buffer.from(JSON.stringify(item)).toString('base64url'))
      .join('.');
    headers = {
      authorization: `Bearer ${unsigned}.${createHmac('sha256', process.env.JWT_SECRET!).update(unsigned).digest('base64url')}`,
    };
    mocks.wod.mockResolvedValue({ id: 'wod', discipline: 'CROSSFIT' });
    mocks.previous.mockResolvedValue(null);
    mocks.save.mockResolvedValue({ id: 'result', score: '12:34', timeSeconds: 754 });
    mocks.profile.mockResolvedValue({ rankingOptIn: true });
    mocks.users.mockResolvedValue([{ id: 'peer', pushSubscriptions: [{ id: 'device' }] }]);
    mocks.announcement.mockResolvedValue({ count: 1 });
    mocks.feed.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await app.close();
  });
  const save = () =>
    app.inject({
      method: 'POST',
      url: '/api/wods/wod/result',
      headers,
      payload: { score: '12:34' },
    });

  it('announces the first save only to other opted-in athletes without copying any score', async () => {
    expect((await save()).statusCode).toBe(201);
    expect(mocks.users).toHaveBeenCalledWith({
      where: { id: { not: 'actor' }, athleteProfile: { is: { rankingOptIn: true } } },
      select: { id: true, pushSubscriptions: { select: { id: true } } },
    });
    expect(mocks.notifications.mock.calls[0]![0].data).toEqual([
      { id: expect.any(String), announcementId: expect.any(String), userId: 'peer' },
    ]);
    expect(mocks.deliveries.mock.calls[0]![0].data).toEqual([
      { notificationId: expect.any(String), subscriptionId: 'device' },
    ]);
    expect(JSON.stringify(mocks.notifications.mock.calls)).not.toMatch(
      /12:34|754|score|timeSeconds/,
    );
  });
  it('does not repeat an announcement on editing a result or replaying a concurrent first-save', async () => {
    mocks.previous.mockResolvedValue({ id: 'result' });
    await save();
    expect(mocks.announcement).not.toHaveBeenCalled();
    mocks.previous.mockResolvedValue(null);
    mocks.announcement.mockResolvedValue({ count: 0 });
    await save();
    expect(mocks.notifications).not.toHaveBeenCalled();
  });
  it('never announces private results, HYROX, invalid submissions or another athlete’s WOD', async () => {
    mocks.profile.mockResolvedValue({ rankingOptIn: false });
    await save();
    expect(mocks.announcement).not.toHaveBeenCalled();
    mocks.profile.mockResolvedValue({ rankingOptIn: true });
    mocks.wod.mockResolvedValue({ discipline: 'HYROX' });
    await save();
    expect(mocks.announcement).not.toHaveBeenCalled();
    mocks.wod.mockResolvedValue(null);
    expect((await save()).statusCode).toBe(404);
    mocks.wod.mockResolvedValue({ discipline: 'CROSSFIT' });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/wods/wod/result',
          headers,
          payload: { score: '' },
        })
      ).statusCode,
    ).toBe(400);
    expect(mocks.notifications).not.toHaveBeenCalled();
  });
  it('requires authentication on every notification endpoint', async () => {
    for (const [method, url] of [
      ['GET', '/notifications'],
      ['PATCH', '/notifications/read'],
      ['GET', '/notifications/push-config'],
      ['POST', '/notifications/push-subscriptions'],
      ['DELETE', '/notifications/push-subscriptions'],
      ['POST', '/notifications/push-subscriptions/status'],
    ] as const) {
      expect((await app.inject({ method, url: `/api${url}` })).statusCode).toBe(401);
    }
    expect(mocks.profile).not.toHaveBeenCalled();
  });
  it('returns only the fixed message, safe link and metadata, and filters by account and current actor opt-in', async () => {
    mocks.feed.mockResolvedValue([
      {
        id,
        createdAt: new Date('2026-10-23T16:00:00Z'),
        readAt: null,
        score: '12:34',
        timeSeconds: 754,
        announcement: { actor: { name: 'Fulano', email: 'private@example.com' } },
      },
    ]);
    mocks.count.mockResolvedValue(1);
    const response = await app.inject({ url: '/api/notifications', headers });
    expect(response.json()).toEqual({
      enabled: true,
      unreadCount: 1,
      notifications: [
        {
          id,
          createdAt: '2026-10-23T16:00:00.000Z',
          readAt: null,
          message: 'Fulano registrou um resultado 👀',
          url: '/ranking',
        },
      ],
    });
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(mocks.feed.mock.calls[0]![0].where).toEqual({
      userId: 'actor',
      announcement: { actor: { athleteProfile: { is: { rankingOptIn: true } } } },
    });
    mocks.profile.mockResolvedValue({ rankingOptIn: false });
    expect((await app.inject({ url: '/api/notifications', headers })).json()).toEqual({
      enabled: false,
      notifications: [],
      unreadCount: 0,
    });
    expect(mocks.feed).toHaveBeenCalledTimes(1);
  });
  it('marks only the authenticated user’s selected notifications and rejects unbounded requests', async () => {
    const invoke = (ids: string[]) =>
      app.inject({ method: 'PATCH', url: '/api/notifications/read', headers, payload: { ids } });
    expect((await invoke([id])).statusCode).toBe(200);
    expect(mocks.read).toHaveBeenCalledWith({
      where: { id: { in: [id] }, userId: 'actor', readAt: null },
      data: { readAt: expect.any(Date) },
    });
    expect((await invoke([])).statusCode).toBe(400);
    expect((await invoke(Array(51).fill(id))).statusCode).toBe(400);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: '/api/notifications/read',
          headers,
          payload: { all: true },
        })
      ).statusCode,
    ).toBe(200);
    expect(mocks.read).toHaveBeenLastCalledWith({
      where: { userId: 'actor', readAt: null, createdAt: { lte: expect.any(Date) } },
      data: { readAt: expect.any(Date) },
    });
  });
  it('rejects arbitrary outbound push hosts and requires ranking membership to register a device', async () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', 'public');
    vi.stubEnv('VAPID_PRIVATE_KEY', 'private');
    vi.stubEnv('VAPID_SUBJECT', 'mailto:test@example.com');
    const invoke = (endpoint: string) =>
      app.inject({
        method: 'POST',
        url: '/api/notifications/push-subscriptions',
        headers,
        payload: { endpoint, keys: { p256dh: 'a'.repeat(87), auth: 'b'.repeat(22) } },
      });
    for (const endpoint of [
      'http://localhost:3333',
      'https://127.0.0.1',
      'https://fcm.googleapis.com.evil.test/send',
      'https://fcm.googleapis.com:8080/send',
    ]) {
      expect((await invoke(endpoint)).statusCode).toBe(400);
    }
    mocks.profile.mockResolvedValue({ rankingOptIn: false });
    expect((await invoke('https://fcm.googleapis.com/fcm/send/device')).statusCode).toBe(403);
    mocks.profile.mockResolvedValue({ rankingOptIn: true });
    expect((await invoke('https://fcm.googleapis.com/fcm/send/device')).statusCode).toBe(201);
    expect(mocks.deleteSubscription).toHaveBeenCalledWith({
      where: { endpoint: 'https://fcm.googleapis.com/fcm/send/device', userId: { not: 'actor' } },
    });
  });
  it('removes subscriptions and both incoming and outgoing announcements on leaving the ranking', async () => {
    mocks.profileSave.mockResolvedValue({ rankingOptIn: false });
    const response = await app.inject({
      method: 'PUT',
      url: '/api/athlete-profile',
      headers,
      payload: { rankingOptIn: false },
    });
    expect(response.statusCode).toBe(200);
    expect(mocks.deleteSubscription).toHaveBeenCalledWith({ where: { userId: 'actor' } });
    expect(mocks.deleteNotifications).toHaveBeenCalledWith({ where: { userId: 'actor' } });
    expect(mocks.deleteAnnouncements).toHaveBeenCalledWith({ where: { actorId: 'actor' } });
  });
  it('checks and removes only the active account’s device subscription and hides push when unconfigured', async () => {
    const endpoint = 'https://fcm.googleapis.com/fcm/send/device';
    mocks.subscriptionStatus.mockResolvedValue(null);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/notifications/push-subscriptions/status',
          headers,
          payload: { endpoint },
        })
      ).json(),
    ).toEqual({ enabled: false });
    expect(mocks.subscriptionStatus.mock.calls[0]![0].where).toEqual({
      endpoint,
      userId: 'actor',
      user: { athleteProfile: { is: { rankingOptIn: true } } },
    });
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: '/api/notifications/push-subscriptions',
          headers,
          payload: { endpoint },
        })
      ).statusCode,
    ).toBe(200);
    expect(mocks.deleteSubscription).toHaveBeenCalledWith({ where: { endpoint, userId: 'actor' } });
    vi.stubEnv('VAPID_PRIVATE_KEY', '');
    expect((await app.inject({ url: '/api/notifications/push-config', headers })).json()).toEqual({
      publicKey: null,
    });
  });
});
