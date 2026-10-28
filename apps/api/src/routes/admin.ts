import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '@wod-coach-ai/database';

import { z } from 'zod';
const RECENT_ACTIVITY_LIMIT = 30;

type AdminActivityType =
  'WOD' | 'ANALYSIS' | 'STRATEGY' | 'HYROX_STRATEGY' | 'RESULT' | 'CHECKIN' | 'PERSONAL_RECORD';

interface AdminActivity {
  id: string;
  type: AdminActivityType;
  userId: string;
  userName: string;
  userEmail: string;
  title: string;
  detail: string | null;
  occurredAt: Date;
}

function latestDate(dates: Array<Date | null | undefined>): Date | null {
  const timestamps = dates
    .filter((date): date is Date => date instanceof Date)
    .map((date) => date.getTime());

  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps));
}

function activityUser(user: { id: string; name: string; email: string }) {
  return {
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
  };
}

function summarizeText(value: string | null | undefined): string | null {
  const text = value?.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > 90 ? `${text.slice(0, 87)}...` : text;
}

function summarizeCheckin(checkin: {
  notes: string | null;
  timeSeconds: number | null;
  rounds: number | null;
  reps: number | null;
  weightKg: number | null;
}): string | null {
  const notes = summarizeText(checkin.notes);
  if (notes) return notes;

  const metrics = [
    checkin.timeSeconds ? `${Math.round(checkin.timeSeconds / 60)} min` : null,
    checkin.rounds ? `${checkin.rounds} rounds` : null,
    checkin.reps ? `${checkin.reps} reps` : null,
    checkin.weightKg ? `${checkin.weightKg} kg` : null,
  ]
    .filter((metric): metric is string => Boolean(metric))
    .join(' · ');

  return metrics || null;
}

async function recentActivities(): Promise<AdminActivity[]> {
  const [wods, analyses, strategies, hyroxStrategies, results, checkins, personalRecords] =
    await Promise.all([
      prisma.wod.findMany({
        orderBy: { updatedAt: 'desc' },
        take: RECENT_ACTIVITY_LIMIT,
        select: {
          id: true,
          name: true,
          rawText: true,
          discipline: true,
          updatedAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.wodAnalysis.findMany({
        orderBy: { updatedAt: 'desc' },
        take: RECENT_ACTIVITY_LIMIT,
        select: {
          id: true,
          stimulus: true,
          updatedAt: true,
          wod: {
            select: {
              name: true,
              rawText: true,
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      }),
      prisma.wodStrategy.findMany({
        orderBy: { updatedAt: 'desc' },
        take: RECENT_ACTIVITY_LIMIT,
        select: {
          id: true,
          goal: true,
          updatedAt: true,
          wod: {
            select: {
              name: true,
              rawText: true,
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      }),
      prisma.hyroxStrategy.findMany({
        orderBy: { updatedAt: 'desc' },
        take: RECENT_ACTIVITY_LIMIT,
        select: {
          id: true,
          workoutSummary: true,
          updatedAt: true,
          wod: {
            select: {
              name: true,
              rawText: true,
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      }),
      prisma.wodResult.findMany({
        orderBy: { updatedAt: 'desc' },
        take: RECENT_ACTIVITY_LIMIT,
        select: {
          id: true,
          score: true,
          updatedAt: true,
          wod: {
            select: {
              name: true,
              rawText: true,
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      }),
      prisma.dailyCheckin.findMany({
        orderBy: { updatedAt: 'desc' },
        take: RECENT_ACTIVITY_LIMIT,
        select: {
          id: true,
          timeSeconds: true,
          rounds: true,
          reps: true,
          weightKg: true,
          notes: true,
          updatedAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.personalRecord.findMany({
        orderBy: { updatedAt: 'desc' },
        take: RECENT_ACTIVITY_LIMIT,
        select: {
          id: true,
          movementName: true,
          value: true,
          unit: true,
          updatedAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

  const activities: AdminActivity[] = [
    ...wods.map((wod) => ({
      id: `wod:${wod.id}`,
      type: 'WOD' as const,
      ...activityUser(wod.user),
      title: wod.discipline === 'HYROX' ? 'Treino HYROX enviado' : 'WOD enviado',
      detail: wod.name ?? summarizeText(wod.rawText),
      occurredAt: wod.updatedAt,
    })),
    ...analyses.map((analysis) => ({
      id: `analysis:${analysis.id}`,
      type: 'ANALYSIS' as const,
      ...activityUser(analysis.wod.user),
      title: 'Analise gerada',
      detail: analysis.wod.name ?? summarizeText(analysis.stimulus ?? analysis.wod.rawText),
      occurredAt: analysis.updatedAt,
    })),
    ...strategies.map((strategy) => ({
      id: `strategy:${strategy.id}`,
      type: 'STRATEGY' as const,
      ...activityUser(strategy.wod.user),
      title: 'Estrategia gerada',
      detail: strategy.wod.name ?? summarizeText(strategy.goal ?? strategy.wod.rawText),
      occurredAt: strategy.updatedAt,
    })),
    ...hyroxStrategies.map((strategy) => ({
      id: `hyrox-strategy:${strategy.id}`,
      type: 'HYROX_STRATEGY' as const,
      ...activityUser(strategy.wod.user),
      title: 'Estrategia HYROX gerada',
      detail: strategy.wod.name ?? summarizeText(strategy.workoutSummary ?? strategy.wod.rawText),
      occurredAt: strategy.updatedAt,
    })),
    ...results.map((result) => ({
      id: `result:${result.id}`,
      type: 'RESULT' as const,
      ...activityUser(result.wod.user),
      title: 'Resultado registrado',
      detail: result.wod.name ? `${result.wod.name}: ${result.score}` : result.score,
      occurredAt: result.updatedAt,
    })),
    ...checkins.map((checkin) => ({
      id: `checkin:${checkin.id}`,
      type: 'CHECKIN' as const,
      ...activityUser(checkin.user),
      title: 'Check-in registrado',
      detail: summarizeCheckin(checkin),
      occurredAt: checkin.updatedAt,
    })),
    ...personalRecords.map((record) => ({
      id: `personal-record:${record.id}`,
      type: 'PERSONAL_RECORD' as const,
      ...activityUser(record.user),
      title: 'PR registrado',
      detail: `${record.movementName}: ${record.value} ${record.unit}`,
      occurredAt: record.updatedAt,
    })),
  ];

  return activities
    .sort((first, second) => second.occurredAt.getTime() - first.occurredAt.getTime())
    .slice(0, RECENT_ACTIVITY_LIMIT);
}

async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const user = await prisma.user.findUnique({
    where: { id: request.user.sub },
    select: { isAdmin: true },
  });

  if (!user || !user.isAdmin) {
    return reply.code(403).send({ error: 'Acesso restrito ao administrador' });
  }
}

export default async function adminRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);
  app.addHook('preHandler', requireAdmin);

  app.patch('/admin/users/:id/access', async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const body = z
      .object({ status: z.enum(['APPROVED', 'BLOCKED']) })
      .strict()
      .safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'Dados inválidos' });
    const actor = await prisma.user.findUniqueOrThrow({ where: { id: request.user.sub } });
    // Serializable transaction makes state changes and their audit atomic, including concurrent requests.
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const target = await tx.user.findUnique({ where: { id: params.data.id } });
          if (!target) return { error: 'Usuário não encontrado', status: 404 } as const;
          if (target.isAdmin || target.id === actor.id) {
            return {
              error: 'O acesso do administrador não pode ser alterado.',
              status: 403,
            } as const;
          }
          if (target.accessStatus === body.data.status) return { user: target };
          const user = await tx.user.update({
            where: { id: target.id },
            data: { accessStatus: body.data.status },
          });
          await tx.userAccessAudit.create({
            data: {
              actorId: actor.id,
              actorEmail: actor.email,
              targetId: target.id,
              targetEmail: target.email,
              fromStatus: target.accessStatus,
              toStatus: body.data.status,
            },
          });
          return { user };
        },
        { isolationLevel: 'Serializable' },
      );
      if (result.error) return reply.code(result.status).send({ error: result.error });
      return reply.send({ user: { id: result.user.id, accessStatus: result.user.accessStatus } });
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 'P2034') {
        return reply
          .code(409)
          .send({
            error: 'O acesso foi alterado por outra solicitação. Recarregue e tente novamente.',
          });
      }
      throw error;
    }
  });

  app.get('/admin/users', async (_request, reply) => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        accessStatus: true,
        isAdmin: true,
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
          accessStatus: user.accessStatus,
          isAdmin: user.isAdmin,
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
    const activities = await recentActivities();

    const accessHistory = await prisma.userAccessAudit.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
    });
    return reply.send({
      accessHistory,
      totals,
      users: rows,
      activities: activities.map((activity) => ({
        ...activity,
        occurredAt: activity.occurredAt.toISOString(),
      })),
    });
  });
}
