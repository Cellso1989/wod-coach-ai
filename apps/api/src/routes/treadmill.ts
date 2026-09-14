import type { FastifyInstance } from "fastify";
import { prisma } from "@wod-coach-ai/database";
import { generateTreadmillWorkout } from "@wod-coach-ai/coach-engine";
import { treadmillGenerateSchema, treadmillSessionInputSchema } from "@wod-coach-ai/validation";

export default async function treadmillRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.post("/treadmill/generate", async (request, reply) => {
    const parsed = treadmillGenerateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: parsed.error.flatten() });
    }

    const workout = generateTreadmillWorkout(parsed.data.level, parsed.data.durationMinutes);
    return reply.send({ workout });
  });

  app.post("/treadmill/sessions", async (request, reply) => {
    const parsed = treadmillSessionInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: parsed.error.flatten() });
    }

    const { blocks, distanceKm, notes, ...rest } = parsed.data;
    const userId = request.user.sub;

    const session = await prisma.treadmillSession.create({
      data: {
        userId,
        ...rest,
        blocks,
        distanceKm,
        notes,
      },
    });

    return reply.code(201).send({ session });
  });

  app.get("/treadmill/sessions", async (request, reply) => {
    const userId = request.user.sub;
    const query = request.query as { limit?: string };
    const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 90);

    const sessions = await prisma.treadmillSession.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: limit,
    });

    return reply.send({ sessions });
  });

  app.delete("/treadmill/sessions/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const existing = await prisma.treadmillSession.findFirst({ where: { id, userId } });
    if (!existing) {
      return reply.code(404).send({ error: "Sessão não encontrada" });
    }

    await prisma.treadmillSession.delete({ where: { id } });
    return reply.code(204).send();
  });
}
