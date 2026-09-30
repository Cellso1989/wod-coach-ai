import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '@wod-coach-ai/database';

const DEFAULT_ADMIN_EMAILS = ['celso.sabino1989@gmail.com'];

function adminEmails(): Set<string> {
  const configured = process.env.ADMIN_EMAILS?.split(',') ?? [];
  const emails = configured
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);

  return new Set(emails.length > 0 ? emails : DEFAULT_ADMIN_EMAILS);
}

function latestDate(dates: Array<Date | null | undefined>): Date | null {
  const timestamps = dates
    .filter((date): date is Date => date instanceof Date)
    .map((date) => date.getTime());

  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps));
}

async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const user = await prisma.user.findUnique({
    where: { id: request.user.sub },
    select: { email: true },
  });

  if (!user || !adminEmails().has(user.email.toLowerCase())) {
    return reply.code(403).send({ error: 'Acesso restrito ao administrador' });
  }
}

export default async function adminRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);
  app.addHook('preHandler', requireAdmin);

  app.get('/admin/users', async (_request, reply) => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            wods: true,
            dailyCheckins: true,
            personalRecords: true,
          },
        },
      },
    });

    const rows = await Promise.all(
      users.map(async (user) => {
        const [analysisCount, strategyCount, resultCount, latestWod, latestCheckin, latestRecord] =
          await Promise.all([
            prisma.wodAnalysis.count({ where: { wod: { userId: user.id } } }),
            prisma.wodStrategy.count({ where: { wod: { userId: user.id } } }),
            prisma.wodResult.count({ where: { wod: { userId: user.id } } }),
            prisma.wod.findFirst({
              where: { userId: user.id },
              orderBy: { updatedAt: 'desc' },
              select: { updatedAt: true },
            }),
            prisma.dailyCheckin.findFirst({
              where: { userId: user.id },
              orderBy: { updatedAt: 'desc' },
              select: { updatedAt: true },
            }),
            prisma.personalRecord.findFirst({
              where: { userId: user.id },
              orderBy: { updatedAt: 'desc' },
              select: { updatedAt: true },
            }),
          ]);

        const lastActivityAt = latestDate([
          user.updatedAt,
          latestWod?.updatedAt,
          latestCheckin?.updatedAt,
          latestRecord?.updatedAt,
        ]);

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          createdAt: user.createdAt.toISOString(),
          lastActivityAt: lastActivityAt?.toISOString() ?? null,
          wodCount: user._count.wods,
          analysisCount,
          strategyCount,
          resultCount,
          checkinCount: user._count.dailyCheckins,
          personalRecordCount: user._count.personalRecords,
        };
      }),
    );

    const totals = rows.reduce(
      (acc, user) => ({
        users: acc.users + 1,
        wods: acc.wods + user.wodCount,
        analyses: acc.analyses + user.analysisCount,
        strategies: acc.strategies + user.strategyCount,
        results: acc.results + user.resultCount,
      }),
      { users: 0, wods: 0, analyses: 0, strategies: 0, results: 0 },
    );

    return reply.send({ totals, users: rows });
  });
}
