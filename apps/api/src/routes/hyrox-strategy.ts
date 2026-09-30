import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '@wod-coach-ai/database';
import { createOpenAiMessageSender, describeOpenAiApiError } from '@wod-coach-ai/ai';
import {
  generateHyroxStrategy,
  HyroxStrategyGenerationError,
  type HyroxStrategyCoachInput,
} from '@wod-coach-ai/coach-engine';
import { hyroxStrategyInputSchema, type HyroxStrategyInput } from '@wod-coach-ai/validation';
import { sendAiDailyLimitError } from '../services/ai-usage-limit-response.js';
import {
  AiDailyLimitExceededError,
  consumeAiDailyUsage,
} from '../services/ai-usage-limit-service.js';

async function generateForUser(
  request: FastifyRequest,
  reply: FastifyReply,
  input: HyroxStrategyInput,
) {
  const userId = request.user.sub;
  const [athleteProfile, personalRecords] = await Promise.all([
    prisma.athleteProfile.findUnique({ where: { userId } }),
    prisma.personalRecord.findMany({
      where: { userId },
      orderBy: { achievedAt: 'desc' },
      take: 30,
    }),
  ]);

  let sendMessage;
  try {
    sendMessage = createOpenAiMessageSender();
  } catch {
    reply.code(503).send({ error: 'A geracao de estrategia por IA ainda nao foi configurada' });
    return null;
  }

  try {
    await consumeAiDailyUsage(userId);
  } catch (err) {
    if (err instanceof AiDailyLimitExceededError) {
      sendAiDailyLimitError(reply, err);
      return null;
    }
    throw err;
  }

  const strategyInput: HyroxStrategyCoachInput = {
    ...input,
    athleteProfile: athleteProfile
      ? {
          level: athleteProfile.level,
          goals: athleteProfile.goals,
          injuries: athleteProfile.injuries,
          limitedMovements: athleteProfile.limitedMovements,
          weeklyFrequency: athleteProfile.weeklyFrequency,
        }
      : null,
    personalRecords: personalRecords.map((record) => ({
      movementName: record.movementName,
      value: record.value,
      unit: record.unit,
      achievedAt: record.achievedAt,
    })),
  };

  try {
    return await generateHyroxStrategy(strategyInput, sendMessage);
  } catch (err) {
    if (err instanceof HyroxStrategyGenerationError) {
      request.log.warn(
        { err: err.message, rawResponse: err.rawResponse },
        'HYROX strategy generation failed',
      );
      reply.code(502).send({ error: 'Nao foi possivel gerar a estrategia HYROX agora' });
      return null;
    }
    const apiError = describeOpenAiApiError(err);
    if (apiError) {
      request.log.error({ err }, 'OpenAI API error during HYROX strategy generation');
      reply.code(apiError.status).send({ error: apiError.message });
      return null;
    }
    throw err;
  }
}

export default async function hyroxStrategyRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.post('/hyrox/strategy', async (request, reply) => {
    const parsed = hyroxStrategyInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Dados invalidos', details: parsed.error.flatten() });
    }

    const strategy = await generateForUser(request, reply, parsed.data);
    if (!strategy) return;
    return reply.send({ strategy });
  });

  app.post('/hyrox-workouts/:id/strategy', async (request, reply) => {
    const { id } = request.params as { id: string };
    const workout = await prisma.wod.findFirst({
      where: { id, userId: request.user.sub, discipline: 'HYROX' },
    });
    if (!workout) return reply.code(404).send({ error: 'Treino HYROX nao encontrado' });
    if (!workout.rawText?.trim()) {
      return reply
        .code(409)
        .send({ error: 'Adicione texto ou analise a imagem antes da estrategia' });
    }

    const strategy = await generateForUser(request, reply, {
      rawWorkout: workout.rawText,
      division: 'OPEN_MEN',
      experience: 'returning',
      strengths: [],
      limiters: [],
    });
    if (!strategy) return;

    const saved = await prisma.hyroxStrategy.upsert({
      where: { wodId: id },
      create: {
        wodId: id,
        workoutSummary: strategy.workoutSummary,
        target: strategy.target,
        runPace: strategy.runPace,
        pacing: strategy.pacing,
        blockPlan: strategy.blockPlan,
        breakStrategy: strategy.breakStrategy,
        transitionStrategy: strategy.transitionStrategy,
        criticalRisk: strategy.criticalRisk,
        finalPush: strategy.finalPush,
        confidence: strategy.confidence,
        warnings: strategy.warnings,
        rawResponse: strategy,
      },
      update: {
        workoutSummary: strategy.workoutSummary,
        target: strategy.target,
        runPace: strategy.runPace,
        pacing: strategy.pacing,
        blockPlan: strategy.blockPlan,
        breakStrategy: strategy.breakStrategy,
        transitionStrategy: strategy.transitionStrategy,
        criticalRisk: strategy.criticalRisk,
        finalPush: strategy.finalPush,
        confidence: strategy.confidence,
        warnings: strategy.warnings,
        rawResponse: strategy,
      },
    });

    return reply.send({ strategy: saved });
  });

  app.get('/hyrox-workouts/:id/strategy', async (request, reply) => {
    const { id } = request.params as { id: string };
    const workout = await prisma.wod.findFirst({
      where: { id, userId: request.user.sub, discipline: 'HYROX' },
    });
    if (!workout) return reply.code(404).send({ error: 'Treino HYROX nao encontrado' });

    const strategy = await prisma.hyroxStrategy.findUnique({ where: { wodId: id } });
    if (!strategy) return reply.code(404).send({ error: 'Este treino ainda nao tem estrategia' });

    return reply.send({ strategy });
  });
}
