import type { FastifyInstance } from "fastify";
import { prisma } from "@wod-coach-ai/database";
import { wodResultSchema, wodFeedbackSchema } from "@wod-coach-ai/validation";

export default async function wodResultRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.post("/wods/:id/result", async (request, reply) => {
    const { id } = request.params as { id: string };

    const wod = await prisma.wod.findFirst({ where: { id, userId: request.user.sub } });
    if (!wod) {
      return reply.code(404).send({ error: "WOD not found" });
    }

    const parsed = wodResultSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const result = await prisma.wodResult.upsert({
      where: { wodId: id },
      create: { wodId: id, ...parsed.data },
      update: parsed.data,
      include: { feedback: true },
    });

    return reply.code(201).send({ result });
  });

  app.post("/wods/:id/feedback", async (request, reply) => {
    const { id } = request.params as { id: string };

    const wod = await prisma.wod.findFirst({
      where: { id, userId: request.user.sub },
      include: { result: true },
    });
    if (!wod) {
      return reply.code(404).send({ error: "WOD not found" });
    }
    if (!wod.result) {
      return reply
        .code(409)
        .send({ error: "Register the WOD result before submitting feedback" });
    }

    const parsed = wodFeedbackSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const feedback = await prisma.wodFeedback.upsert({
      where: { wodResultId: wod.result.id },
      create: { wodResultId: wod.result.id, ...parsed.data },
      update: parsed.data,
    });

    return reply.code(201).send({ feedback });
  });
}
