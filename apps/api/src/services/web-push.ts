import type { FastifyInstance } from 'fastify';
import webpush from 'web-push';
import { prisma } from '@wod-coach-ai/database';
import { resultNotificationMessage } from './ranking-notifications.js';

export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    // Subscription endpoints are untrusted input: never POST to arbitrary servers.
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname === 'fcm.googleapis.com' ||
        url.hostname === 'updates.push.services.mozilla.com' ||
        url.hostname === 'web.push.apple.com' ||
        url.hostname.endsWith('.push.apple.com') ||
        url.hostname.endsWith('.notify.windows.com'))
    );
  } catch {
    return false;
  }
}

export function pushConfiguration() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

export async function deliverPendingPush(app: Pick<FastifyInstance, 'log'>) {
  const vapidDetails = pushConfiguration();
  if (!vapidDetails) return;
  const pending = await prisma.pushDelivery.findMany({
    where: {
      finishedAt: null,
      attempts: { lt: 5 },
      nextAttemptAt: { lte: new Date() },
      leaseUntil: { lte: new Date() },
    },
    orderBy: { nextAttemptAt: 'asc' },
    take: 25,
    select: { id: true },
  });
  for (const candidate of pending) {
    const now = new Date();
    const claimed = await prisma.pushDelivery.updateMany({
      where: {
        id: candidate.id,
        finishedAt: null,
        attempts: { lt: 5 },
        nextAttemptAt: { lte: now },
        leaseUntil: { lte: now },
      },
      data: { leaseUntil: new Date(now.getTime() + 60_000), attempts: { increment: 1 } },
    });
    if (!claimed.count) continue;
    const delivery = await prisma.pushDelivery.findUnique({
      where: { id: candidate.id },
      include: {
        subscription: true,
        notification: {
          include: {
            user: { select: { athleteProfile: { select: { rankingOptIn: true } } } },
            announcement: {
              include: {
                actor: {
                  select: { name: true, athleteProfile: { select: { rankingOptIn: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!delivery) continue;
    const { notification, subscription } = delivery;
    const actor = notification.announcement.actor;
    if (
      !actor.athleteProfile?.rankingOptIn ||
      !notification.user.athleteProfile?.rankingOptIn ||
      subscription.userId !== notification.userId ||
      notification.createdAt.getTime() < now.getTime() - 86_400_000 ||
      !isAllowedPushEndpoint(subscription.endpoint)
    ) {
      await prisma.pushDelivery.updateMany({
        where: { id: delivery.id },
        data: { finishedAt: now },
      });
      continue;
    }
    try {
      // Explicit allowlist payload: no score, time, reps, workout text or result URL.
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify({
          title: 'WOD Coach AI',
          body: resultNotificationMessage(actor.name),
          tag: notification.id,
          url: '/ranking',
        }),
        { vapidDetails, TTL: 3600, timeout: 10_000 },
      );
      await prisma.pushDelivery.updateMany({
        where: { id: delivery.id },
        data: { finishedAt: new Date() },
      });
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await prisma.pushSubscription.deleteMany({ where: { id: subscription.id } });
      } else {
        await prisma.pushDelivery.updateMany({
          where: { id: delivery.id },
          data: {
            finishedAt: delivery.attempts >= 5 ? new Date() : null,
            nextAttemptAt: new Date(Date.now() + 30_000 * 2 ** delivery.attempts),
          },
        });
        // Do not log endpoints, device keys or provider response bodies.
        app.log.warn(
          { statusCode, deliveryId: delivery.id },
          'Push delivery failed; retry scheduled when eligible',
        );
      }
    }
  }
}

export function registerPushDeliveryWorker(app: FastifyInstance) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let running: Promise<void> | undefined;
  const tick = () => {
    if (running) return;
    running = deliverPendingPush(app)
      .catch(() => {
        app.log.warn('Could not process pending push notifications');
      })
      .finally(() => {
        running = undefined;
      });
  };
  app.addHook('onReady', async () => {
    if (!pushConfiguration()) return;
    timer = setInterval(tick, 15_000);
    timer.unref();
    tick();
  });
  app.addHook('onClose', async () => {
    clearInterval(timer);
    await running;
  });
}
