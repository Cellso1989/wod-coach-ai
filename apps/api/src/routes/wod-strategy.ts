import type { FastifyInstance } from "fastify";
import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@wod-coach-ai/database";
import { createAnthropicClient, describeAnthropicApiError } from "@wod-coach-ai/ai";
import {
  generateStrategy,
  StrategyGenerationError,
  type StrategyCoachInput,
} from "@wod-coach-ai/coach-engine";
import {
  getAthleteContextForWod,
  WodNotFoundError,
  WodNotAnalyzedError,
} from "../services/athlete-context-service.js";

function startOfDayUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export default async function wodStrategyRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.post("/wods/:id/strategy", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    let athleteContextResult;
    try {
      athleteContextResult = await getAthleteContextForWod(userId, id);
    } catch (err) {
      if (err instanceof WodNotFoundError) {
        return reply.code(404).send({ error: "WOD não encontrado" });
      }
      if (err instanceof WodNotAnalyzedError) {
        return reply.code(409).send({ error: "Analise este WOD antes de gerar uma estratégia" });
      }
      throw err;
    }

    const wodWithAnalysis = await prisma.wod.findUniqueOrThrow({
      where: { id },
      include: { analysis: { include: { movements: true } } },
    });
    const analysis = wodWithAnalysis.analysis!;

    const [athleteProfile, todayCheckin] = await Promise.all([
      prisma.athleteProfile.findUnique({ where: { userId } }),
      prisma.dailyCheckin.findUnique({
        where: { userId_date: { userId, date: startOfDayUtc(new Date()) } },
      }),
    ]);

    let client: Anthropic;
    try {
      client = createAnthropicClient();
    } catch {
      return reply.code(503).send({ error: "A geração de estratégia por IA ainda não foi configurada" });
    }

    const strategyInput: StrategyCoachInput = {
      wodAnalysis: {
        format: analysis.format,
        durationMinutes: analysis.durationMinutes,
        stimulus: analysis.stimulus,
        movements: analysis.movements.map((m) => ({
          name: m.name,
          category: m.category,
          reps: m.reps,
          distanceMeters: m.distanceMeters,
          loadDescription: m.loadDescription,
          calories: m.calories,
        })),
        estimatedDemand: {
          engine: analysis.engineDemand ?? 5,
          grip: analysis.gripDemand ?? 5,
          legs: analysis.legDemand ?? 5,
          gymnastics: analysis.gymnasticsDemand ?? 5,
          technical: analysis.technicalDemand ?? 5,
        },
        estimatedIntensity: analysis.estimatedIntensity,
        confidence: analysis.confidence,
        warnings: analysis.warnings,
      },
      athleteContext: athleteContextResult.context,
      checkin: todayCheckin
        ? {
            readinessScore: todayCheckin.readinessScore,
            readinessBand: todayCheckin.readinessBand as "low" | "moderate" | "high",
            cautionFlags: todayCheckin.cautionFlags,
            sleep: todayCheckin.sleep,
            energy: todayCheckin.energy,
            stress: todayCheckin.stress,
            muscleSoreness: todayCheckin.muscleSoreness,
            jointPain: todayCheckin.jointPain,
            motivation: todayCheckin.motivation,
          }
        : null,
      athleteProfile: athleteProfile
        ? {
            level: athleteProfile.level,
            goals: athleteProfile.goals,
            injuries: athleteProfile.injuries,
            limitedMovements: athleteProfile.limitedMovements,
            weeklyFrequency: athleteProfile.weeklyFrequency,
          }
        : null,
    };

    let output;
    try {
      output = await generateStrategy(strategyInput, (params) => client.messages.create(params));
    } catch (err) {
      if (err instanceof StrategyGenerationError) {
        request.log.warn({ err: err.message, rawResponse: err.rawResponse }, "Strategy generation failed");
        return reply.code(502).send({ error: "Não foi possível gerar uma estratégia agora" });
      }
      const apiError = describeAnthropicApiError(err);
      if (apiError) {
        request.log.error({ err }, "Anthropic API error during strategy generation");
        return reply.code(apiError.status).send({ error: apiError.message });
      }
      throw err;
    }

    const strategy = await prisma.wodStrategy.upsert({
      where: { wodId: id },
      create: {
        wodId: id,
        recommendedIntensity: output.recommendedIntensity,
        targetRpe: output.targetRpe,
        loadRecommendation: output.loadRecommendation,
        pacing: output.pacing,
        breakStrategy: output.breakStrategy,
        restStrategy: output.restStrategy,
        movementStrategy: output.movementStrategy,
        transitionStrategy: output.transitionStrategy,
        energyManagement: output.energyManagement,
        goal: output.goal,
        target: output.target,
        criticalPoint: output.criticalPoint,
        confidence: output.confidence,
        warnings: output.warnings,
        rawResponse: output,
      },
      update: {
        recommendedIntensity: output.recommendedIntensity,
        targetRpe: output.targetRpe,
        loadRecommendation: output.loadRecommendation,
        pacing: output.pacing,
        breakStrategy: output.breakStrategy,
        restStrategy: output.restStrategy,
        movementStrategy: output.movementStrategy,
        transitionStrategy: output.transitionStrategy,
        energyManagement: output.energyManagement,
        goal: output.goal,
        target: output.target,
        criticalPoint: output.criticalPoint,
        confidence: output.confidence,
        warnings: output.warnings,
        rawResponse: output,
      },
    });

    return reply.send({ strategy });
  });

  app.get("/wods/:id/strategy", async (request, reply) => {
    const { id } = request.params as { id: string };

    const wod = await prisma.wod.findFirst({ where: { id, userId: request.user.sub } });
    if (!wod) {
      return reply.code(404).send({ error: "WOD não encontrado" });
    }

    const strategy = await prisma.wodStrategy.findUnique({ where: { wodId: id } });
    if (!strategy) {
      return reply.code(404).send({ error: "Este WOD ainda não tem estratégia" });
    }

    return reply.send({ strategy });
  });
}
