import type { FastifyInstance } from "fastify";
import { prisma } from "@wod-coach-ai/database";
import { wodResultSchema } from "@wod-coach-ai/validation";

export default async function wodResultRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.post("/wods/:id/result", async (request, reply) => {
    const { id } = request.params as { id: string };

    const wod = await prisma.wod.findFirst({ where: { id, userId: request.user.sub } });
    if (!wod) {
      return reply.code(404).send({ error: "WOD não encontrado" });
    }

    const parsed = wodResultSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: parsed.error.flatten() });
    }

    const result = await prisma.wodResult.upsert({
      where: { wodId: id },
      create: { wodId: id, ...parsed.data },
      update: parsed.data,
    });

    return reply.code(201).send({ result });
  });
}
