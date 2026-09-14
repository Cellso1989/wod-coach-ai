import type { FastifyInstance } from "fastify";
import { prisma } from "@wod-coach-ai/database";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

function startOfWeekUtc(date: Date): Date {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Semana começa na segunda-feira (dia 1); domingo (dia 0) fica no fim da semana anterior.
  const weekday = day.getUTCDay();
  const diffToMonday = weekday === 0 ? 6 : weekday - 1;
  day.setUTCDate(day.getUTCDate() - diffToMonday);
  return day;
}

export default async function statsRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.get("/stats/training-frequency", async (request, reply) => {
    const userId = request.user.sub;
    const query = request.query as { weeks?: string };
    const weeks = Math.min(Math.max(Number(query.weeks ?? 8), 1), 26);

    const currentWeekStart = startOfWeekUtc(new Date());
    const rangeStart = new Date(currentWeekStart.getTime() - (weeks - 1) * MS_PER_WEEK);

    const [wods, treadmillSessions] = await Promise.all([
      prisma.wod.findMany({
        where: { userId, date: { gte: rangeStart } },
        select: { date: true },
      }),
      prisma.treadmillSession.findMany({
        where: { userId, date: { gte: rangeStart } },
        select: { date: true },
      }),
    ]);

    const buckets = Array.from({ length: weeks }, (_, i) => {
      const weekStart = new Date(rangeStart.getTime() + i * MS_PER_WEEK);
      return { weekStart: weekStart.toISOString(), wodCount: 0, treadmillCount: 0 };
    });

    function bucketIndexFor(date: Date): number | null {
      const weekStart = startOfWeekUtc(date);
      const diffWeeks = Math.round((weekStart.getTime() - rangeStart.getTime()) / MS_PER_WEEK);
      return diffWeeks >= 0 && diffWeeks < weeks ? diffWeeks : null;
    }

    for (const wod of wods) {
      const index = bucketIndexFor(wod.date);
      if (index != null) buckets[index]!.wodCount += 1;
    }
    for (const session of treadmillSessions) {
      const index = bucketIndexFor(session.date);
      if (index != null) buckets[index]!.treadmillCount += 1;
    }

    return reply.send({ weeks: buckets });
  });
}
