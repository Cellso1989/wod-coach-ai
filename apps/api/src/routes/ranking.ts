import type { FastifyInstance } from 'fastify';
import { prisma } from '@wod-coach-ai/database';
import { z } from 'zod';
import { buildMonthlyRanking, rankingMonth } from '../lib/monthly-ranking.js';

const querySchema = z.object({
  month: z
    .string()
    .regex(/^20\d{2}-(?:0[1-9]|1[0-2])$/)
    .optional(),
});

export default async function rankingRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);
  app.get('/ranking/monthly', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success)
      return reply.code(400).send({ error: 'Selecione um mês válido (AAAA-MM).' });
    const month = parsed.data.month ?? rankingMonth(new Date());
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
          createdAt: { gte: start, lt: end },
          wod: { discipline: 'CROSSFIT', user: { athleteProfile: { is: { rankingOptIn: true } } } },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          score: true,
          createdAt: true,
          wod: {
            select: {
              userId: true,
              name: true,
              rawText: true,
              notes: true,
              analysis: {
                select: {
                  format: true,
                  durationMinutes: true,
                  roundBreakdown: true,
                  rawResponse: true,
                  movements: {
                    orderBy: { order: 'asc' },
                    select: {
                      name: true,
                      category: true,
                      reps: true,
                      distanceMeters: true,
                      calories: true,
                      loadDescription: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);
    return reply.send(buildMonthlyRanking(users, results, month, request.user.sub));
  });
}
