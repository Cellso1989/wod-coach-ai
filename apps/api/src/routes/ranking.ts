import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '@wod-coach-ai/database';
import { z } from 'zod';
import {
  buildDailyRanking,
  buildMonthlyRanking,
  rankingMonth,
  rankingWeekStart,
} from '../lib/monthly-ranking.js';

const querySchema = z.object({
  month: z
    .string()
    .regex(/^20\d{2}-(?:0[1-9]|1[0-2])$/)
    .optional(),
});

export default async function rankingRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);
  const respond = async (request: FastifyRequest, reply: FastifyReply, daily: boolean) => {
    const now = new Date();
    reply.header('Cache-Control', 'private, no-store');
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success)
      return reply.code(400).send({ error: 'Selecione um mês válido (AAAA-MM).' });
    const month = daily ? rankingMonth(now) : (parsed.data.month ?? rankingMonth(now));
    const [year, monthNumber] = month.split('-').map(Number) as [number, number];
    // Fetch a broad UTC window; the ranking applies exact São Paulo month boundaries.
    const start = new Date(Date.UTC(year, monthNumber - 1, 1));
    const end = new Date(Date.UTC(year, monthNumber, 2));
    const [users, results] = await Promise.all([
      prisma.user.findMany({
        where: { athleteProfile: { is: { rankingOptIn: true } } },
        select: { id: true, name: true },
      }),
      prisma.wodResult.findMany({
        where: {
          OR: [
            { createdAt: { gte: start, lt: end } },
            { createdAt: { gte: new Date(`${rankingWeekStart(now)}T03:00:00Z`), lte: now } },
          ],
          wod: { discipline: 'CROSSFIT', user: { athleteProfile: { is: { rankingOptIn: true } } } },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          score: true,
          createdAt: true,
          wod: { select: { userId: true } },
        },
      }),
    ]);
    return reply.send(
      daily
        ? buildDailyRanking(users, results, request.user.sub, now)
        : buildMonthlyRanking(users, results, month, request.user.sub, now),
    );
  };
  app.get('/ranking/monthly', (request, reply) => respond(request, reply, false));
  app.get('/ranking/daily', (request, reply) => respond(request, reply, true));
}
