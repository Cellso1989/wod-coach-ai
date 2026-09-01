import type { FastifyInstance } from "fastify";
import { prisma } from "@wod-coach-ai/database";
import { personalRecordSchema } from "@wod-coach-ai/validation";

export default async function personalRecordRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.post("/personal-records", async (request, reply) => {
    const parsed = personalRecordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: parsed.error.flatten() });
    }

    const record = await prisma.personalRecord.create({
      data: { userId: request.user.sub, ...parsed.data },
    });

    return reply.code(201).send({ record });
  });

  app.get("/personal-records", async (request, reply) => {
    const records = await prisma.personalRecord.findMany({
      where: { userId: request.user.sub },
      orderBy: [{ movementName: "asc" }, { achievedAt: "desc" }],
    });

    return reply.send({ records });
  });

  app.put("/personal-records/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.personalRecord.findFirst({
      where: { id, userId: request.user.sub },
    });
    if (!existing) {
      return reply.code(404).send({ error: "PR não encontrado" });
    }

    const parsed = personalRecordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: parsed.error.flatten() });
    }

    const record = await prisma.personalRecord.update({
      where: { id },
      data: parsed.data,
    });

    return reply.send({ record });
  });

  app.delete("/personal-records/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.personalRecord.findFirst({
      where: { id, userId: request.user.sub },
    });
    if (!existing) {
      return reply.code(404).send({ error: "PR não encontrado" });
    }

    await prisma.personalRecord.delete({ where: { id } });

    return reply.code(204).send();
  });
}
