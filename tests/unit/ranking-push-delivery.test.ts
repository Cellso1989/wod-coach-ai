import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deliverPendingPush } from '../../apps/api/src/services/web-push.js';

const mocks = vi.hoisted(() => ({
  pending: vi.fn(),
  claim: vi.fn(),
  delivery: vi.fn(),
  remove: vi.fn(),
  send: vi.fn(),
}));
vi.mock('../../apps/api/node_modules/web-push/src/index.js', () => ({
  default: { sendNotification: mocks.send },
}));
vi.mock('../../packages/database/dist/index.js', () => ({
  prisma: {
    pushDelivery: { findMany: mocks.pending, updateMany: mocks.claim, findUnique: mocks.delivery },
    pushSubscription: { deleteMany: mocks.remove },
  },
}));

const logger = { log: { warn: vi.fn() } } as unknown as Parameters<typeof deliverPendingPush>[0];
const job = () => ({
  id: 'job',
  attempts: 1,
  subscription: {
    id: 'device',
    userId: 'peer',
    endpoint: 'https://fcm.googleapis.com/fcm/send/device',
    p256dh: 'key',
    auth: 'auth',
  },
  notification: {
    id: 'notification',
    userId: 'peer',
    createdAt: new Date(),
    score: '12:34',
    timeSeconds: 754,
    user: { athleteProfile: { rankingOptIn: true } },
    announcement: { actor: { name: 'Fulano', athleteProfile: { rankingOptIn: true } } },
  },
});

describe('durable push delivery', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('VAPID_PUBLIC_KEY', 'public');
    vi.stubEnv('VAPID_PRIVATE_KEY', 'private');
    vi.stubEnv('VAPID_SUBJECT', 'mailto:test@example.com');
    mocks.pending.mockResolvedValue([{ id: 'job' }]);
    mocks.claim.mockResolvedValue({ count: 1 });
    mocks.delivery.mockResolvedValue(job());
    mocks.send.mockResolvedValue({ statusCode: 201 });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sends exactly the agreed message with no score or workout fields', async () => {
    await deliverPendingPush(logger);
    const payload = JSON.parse(mocks.send.mock.calls[0]![1]);
    expect(payload).toEqual({
      title: 'WOD Coach AI',
      body: 'Fulano registrou um resultado 👀',
      tag: 'notification',
      url: '/ranking',
    });
    expect(mocks.claim).toHaveBeenLastCalledWith({
      where: { id: 'job' },
      data: { finishedAt: expect.any(Date) },
    });
  });
  it.each(['actor', 'recipient', 'account', 'expired', 'endpoint'])(
    'rechecks %s before sending, even for a queued notification',
    async (reason) => {
      const delivery = job();
      if (reason === 'actor')
        delivery.notification.announcement.actor.athleteProfile.rankingOptIn = false;
      if (reason === 'recipient') delivery.notification.user.athleteProfile.rankingOptIn = false;
      if (reason === 'account') delivery.subscription.userId = 'another-account';
      if (reason === 'expired') delivery.notification.createdAt = new Date(Date.now() - 86_400_001);
      if (reason === 'endpoint') delivery.subscription.endpoint = 'https://127.0.0.1/internal';
      mocks.delivery.mockResolvedValue(delivery);
      await deliverPendingPush(logger);
      expect(mocks.send).not.toHaveBeenCalled();
    },
  );
  it('does not send when another worker owns the lease', async () => {
    mocks.claim.mockResolvedValue({ count: 0 });
    await deliverPendingPush(logger);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('retries provider failures without throwing and retires expired subscriptions', async () => {
    mocks.send.mockRejectedValue({ statusCode: 503 });
    await expect(deliverPendingPush(logger)).resolves.toBeUndefined();
    expect(mocks.claim).toHaveBeenLastCalledWith({
      where: { id: 'job' },
      data: { finishedAt: null, nextAttemptAt: expect.any(Date) },
    });
    mocks.send.mockRejectedValue({ statusCode: 410 });
    await deliverPendingPush(logger);
    expect(mocks.remove).toHaveBeenCalledWith({ where: { id: 'device' } });
  });
  it('finishes after the final failed attempt and leaves in-app history independent of push configuration', async () => {
    mocks.delivery.mockResolvedValue({ ...job(), attempts: 5 });
    mocks.send.mockRejectedValue({ statusCode: 503 });
    await deliverPendingPush(logger);
    expect(mocks.claim.mock.calls.at(-1)![0].data.finishedAt).toBeInstanceOf(Date);
    vi.stubEnv('VAPID_PRIVATE_KEY', '');
    mocks.pending.mockClear();
    await deliverPendingPush(logger);
    expect(mocks.pending).not.toHaveBeenCalled();
  });
});
