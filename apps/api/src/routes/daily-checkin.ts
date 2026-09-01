import type { FastifyInstance } from "fastify";
import { prisma } from "@wod-coach-ai/database";
import { dailyCheckinSchema } from "@wod-coach-ai/validation";
import { calculateReadinessScore } from "@wod-coach-ai/coach-engine";

function startOfDayUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export default async function dailyCheckinRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.post("/checkins", async (request, reply) => {
    const parsed = dailyCheckinSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: parsed.error.flatten() });
    }

    const { date, weightKg, notes, ...metrics } = parsed.data;
    const userId = request.user.sub;
    const normalizedDate = startOfDayUtc(date ?? new Date());

    const readiness = calculateReadinessScore(metrics);

    const checkin = await prisma.dailyCheckin.upsert({
      where: { userId_date: { userId, date: normalizedDate } },
      create: {
        userId,
        date: normalizedDate,
        ...metrics,
        weightKg,
        notes,
        readinessScore: readiness.score,
        readinessBand: readiness.band,
        cautionFlags: readiness.cautionFlags,
      },
      update: {
        ...metrics,
        weightKg,
        notes,
        readinessScore: readiness.score,
        readinessBand: readiness.band,
        cautionFlags: readiness.cautionFlags,
      },
    });

    return reply.code(201).send({ checkin });
  });

  app.get("/checkins/today", async (request, reply) => {
    const userId = request.user.sub;
    const today = startOfDayUtc(new Date());

    const checkin = await prisma.dailyCheckin.findUnique({
      where: { userId_date: { userId, date: today } },
    });

    if (!checkin) {
      return reply.code(404).send({ error: "Nenhum check-in registrado hoje" });
    }

    return reply.send({ checkin });
  });

  app.get("/checkins", async (request, reply) => {
    const userId = request.user.sub;
    const query = request.query as { limit?: string };
    const limit = Math.min(Math.max(Number(query.limit ?? 28), 1), 90);

    const checkins = await prisma.dailyCheckin.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: limit,
    });

    return reply.send({ checkins });
  });
}
