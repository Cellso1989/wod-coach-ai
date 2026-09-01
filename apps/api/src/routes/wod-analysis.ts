import type { FastifyInstance } from "fastify";
import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@wod-coach-ai/database";
import { createAnthropicClient } from "@wod-coach-ai/ai";
import { analyzeWod, WodAnalysisError } from "@wod-coach-ai/coach-engine";

export default async function wodAnalysisRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.post("/wods/:id/analyze", async (request, reply) => {
    const { id } = request.params as { id: string };

    const wod = await prisma.wod.findFirst({ where: { id, userId: request.user.sub } });
    if (!wod) {
      return reply.code(404).send({ error: "WOD não encontrado" });
    }

    let client: Anthropic;
    try {
      client = createAnthropicClient();
    } catch {
      return reply.code(503).send({ error: "A análise por IA ainda não foi configurada" });
    }

    let output;
    try {
      output = await analyzeWod(
        { rawText: wod.rawText, imageBase64: wod.imageData, imageMimeType: wod.imageMimeType },
        (params) => client.messages.create(params),
      );
    } catch (err) {
      if (err instanceof WodAnalysisError) {
        request.log.warn({ err: err.message, rawResponse: err.rawResponse }, "WOD analysis failed");
        return reply.code(502).send({ error: "Não foi possível analisar este WOD agora" });
      }
      throw err;
    }

    const analysis = await prisma.wodAnalysis.upsert({
      where: { wodId: wod.id },
      create: {
        wodId: wod.id,
        format: output.format,
        durationMinutes: output.durationMinutes,
        stimulus: output.stimulus,
        estimatedIntensity: output.estimatedIntensity,
        engineDemand: output.estimatedDemand.engine,
        gripDemand: output.estimatedDemand.grip,
        legDemand: output.estimatedDemand.legs,
        gymnasticsDemand: output.estimatedDemand.gymnastics,
        technicalDemand: output.estimatedDemand.technical,
        confidence: output.confidence,
        warnings: output.warnings,
        rawResponse: output,
        movements: {
          create: output.movements.map((movement, index) => ({
            order: index,
            name: movement.name,
            category: movement.category,
            reps: movement.reps ?? undefined,
            distanceMeters: movement.distanceMeters ?? undefined,
            loadDescription: movement.loadDescription ?? undefined,
            calories: movement.calories ?? undefined,
          })),
        },
      },
      update: {
        format: output.format,
        durationMinutes: output.durationMinutes,
        stimulus: output.stimulus,
        estimatedIntensity: output.estimatedIntensity,
        engineDemand: output.estimatedDemand.engine,
        gripDemand: output.estimatedDemand.grip,
        legDemand: output.estimatedDemand.legs,
        gymnasticsDemand: output.estimatedDemand.gymnastics,
        technicalDemand: output.estimatedDemand.technical,
        confidence: output.confidence,
        warnings: output.warnings,
        rawResponse: output,
        movements: {
          deleteMany: {},
          create: output.movements.map((movement, index) => ({
            order: index,
            name: movement.name,
            category: movement.category,
            reps: movement.reps ?? undefined,
            distanceMeters: movement.distanceMeters ?? undefined,
            loadDescription: movement.loadDescription ?? undefined,
            calories: movement.calories ?? undefined,
          })),
        },
      },
      include: { movements: { orderBy: { order: "asc" } } },
    });

    return reply.send({ analysis });
  });

  app.get("/wods/:id/analysis", async (request, reply) => {
    const { id } = request.params as { id: string };

    const wod = await prisma.wod.findFirst({ where: { id, userId: request.user.sub } });
    if (!wod) {
      return reply.code(404).send({ error: "WOD não encontrado" });
    }

    const analysis = await prisma.wodAnalysis.findUnique({
      where: { wodId: id },
      include: { movements: { orderBy: { order: "asc" } } },
    });

    if (!analysis) {
      return reply.code(404).send({ error: "Este WOD ainda não foi analisado" });
    }

    return reply.send({ analysis });
  });
}
