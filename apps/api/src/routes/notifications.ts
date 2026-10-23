import type { FastifyInstance } from 'fastify';
import { prisma } from '@wod-coach-ai/database';
import { z } from 'zod';
import { resultNotificationMessage } from '../services/ranking-notifications.js';
import { isAllowedPushEndpoint, pushConfiguration } from '../services/web-push.js';

const endpointSchema = z.string().max(2048).url().refine(isAllowedPushEndpoint);
const subscriptionSchema = z.object({
  endpoint: endpointSchema,
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  }),
});

export default async function notificationRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
  });

  app.get('/notifications', async (request) => {
    const profile = await prisma.athleteProfile.findUnique({ where: { userId: request.user.sub } });
    const enabled = profile?.rankingOptIn === true;
    if (!enabled) return { enabled: false, notifications: [], unreadCount: 0 };
    const where = {
      userId: request.user.sub,
      announcement: { actor: { athleteProfile: { is: { rankingOptIn: true } } } },
    };
    const [notifications, unreadCount] = await Promise.all([
      prisma.rankingNotification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
        select: {
          id: true,
          createdAt: true,
          readAt: true,
          announcement: { select: { actor: { select: { name: true } } } },
        },
      }),
      prisma.rankingNotification.count({ where: { ...where, readAt: null } }),
    ]);
    return {
      enabled: true,
      unreadCount,
      notifications: notifications.map((notification) => ({
        id: notification.id,
        createdAt: notification.createdAt,
        readAt: notification.readAt,
        message: resultNotificationMessage(notification.announcement.actor.name),
        url: '/ranking',
      })),
    };
  });

  app.patch('/notifications/read', async (request, reply) => {
    const parsed = z
      .union([
        z.object({ ids: z.array(z.string().uuid()).min(1).max(50) }),
        z.object({ all: z.literal(true) }),
      ])
      .safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Selecione notificações válidas.' });
    await prisma.rankingNotification.updateMany({
      where: {
        ...('ids' in parsed.data
          ? { id: { in: parsed.data.ids } }
          : { createdAt: { lte: new Date() } }),
        userId: request.user.sub,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return { ok: true };
  });

  app.get('/notifications/push-config', async () => ({
    publicKey: pushConfiguration()?.publicKey ?? null,
  }));

  app.post('/notifications/push-subscriptions/status', async (request, reply) => {
    const parsed = z.object({ endpoint: endpointSchema }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Dispositivo inválido.' });
    const subscription = await prisma.pushSubscription.findFirst({
      where: {
        endpoint: parsed.data.endpoint,
        userId: request.user.sub,
        user: { athleteProfile: { is: { rankingOptIn: true } } },
      },
      select: { id: true },
    });
    return { enabled: !!subscription };
  });

  app.post('/notifications/push-subscriptions', async (request, reply) => {
    const parsed = subscriptionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Dispositivo inválido.' });
    if (!pushConfiguration())
      return reply.code(503).send({ error: 'Notificações push ainda não estão disponíveis.' });
    const profile = await prisma.athleteProfile.findUnique({ where: { userId: request.user.sub } });
    if (!profile?.rankingOptIn)
      return reply.code(403).send({ error: 'Participe do ranking para ativar os avisos.' });
    const { endpoint, keys } = parsed.data;
    // Re-registering a shared device must discard the previous account's queued messages.
    await prisma.$transaction(async (tx) => {
      await tx.pushSubscription.deleteMany({
        where: { endpoint, userId: { not: request.user.sub } },
      });
      await tx.pushSubscription.upsert({
        where: { endpoint },
        create: { userId: request.user.sub, endpoint, ...keys },
        update: keys,
      });
    });
    return reply.code(201).send({ ok: true });
  });

  app.delete('/notifications/push-subscriptions', async (request, reply) => {
    const parsed = z.object({ endpoint: endpointSchema }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Dispositivo inválido.' });
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: parsed.data.endpoint, userId: request.user.sub },
    });
    return { ok: true };
  });
}
