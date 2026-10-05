import type { FastifyInstance } from 'fastify';
import { prisma, type WodMovement } from '@wod-coach-ai/database';
import { createOpenAiMessageSender, describeOpenAiApiError } from '@wod-coach-ai/ai';
import {
  generateStrategy,
  StrategyGenerationError,
  type StrategyCoachInput,
} from '@wod-coach-ai/coach-engine';
import type { WodRoundOutput } from '@wod-coach-ai/validation';
import {
  getAthleteContextForWod,
  WodNotFoundError,
  WodNotAnalyzedError,
} from '../services/athlete-context-service.js';
import { lockWodVersions, recordStrategyVersion } from '../services/wod-version-service.js';
import { captureAiGeneration } from '../services/ai-generation-metadata.js';
import { runWodGeneration } from '../services/wod-generation-lease.js';

export default async function wodStrategyRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.post('/wods/:id/strategy', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const crossfitWod = await prisma.wod.findFirst({
      where: { id, userId, discipline: 'CROSSFIT' },
      select: { id: true },
    });
    if (!crossfitWod) {
      return reply.code(404).send({ error: 'WOD nÃ£o encontrado' });
    }

    return runWodGeneration(
      {
        wodId: id,
        userId,
        operation: 'STRATEGY',
        onCleanupError: (err) => request.log.error({ err }, 'WOD generation lease cleanup failed'),
      },
      async (lease) => {
        let athleteContextResult;
        try {
          athleteContextResult = await getAthleteContextForWod(userId, id);
        } catch (err) {
          if (err instanceof WodNotFoundError) {
            reply.code(404);
            return { error: 'WOD não encontrado' };
          }
          if (err instanceof WodNotAnalyzedError) {
            reply.code(409);
            return { error: 'Analise este WOD antes de gerar uma estratégia' };
          }
          throw err;
        }

        const wodWithAnalysis = athleteContextResult.targetWod;
        const analysis = wodWithAnalysis.analysis;
        if (!analysis.versionId) {
          reply.code(409);
          return { error: 'Reanalise este WOD antes de gerar uma estrategia' };
        }
        const analysisVersionId = analysis.versionId;

        const athleteProfile = await prisma.athleteProfile.findUnique({ where: { userId } });

        let sendMessage;
        try {
          sendMessage = createOpenAiMessageSender();
        } catch {
          reply.code(503);
          return { error: 'A geração de estratégia por IA ainda não foi configurada' };
        }

        const strategyInput: StrategyCoachInput = {
          wodAnalysis: {
            format: analysis.format,
            durationMinutes: analysis.durationMinutes,
            stimulus: analysis.stimulus,
            movements: analysis.movements.map((m: WodMovement) => ({
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
            rounds: (analysis.roundBreakdown as WodRoundOutput[] | null) ?? null,
          },
          athleteContext: athleteContextResult.context,
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

        const generation = captureAiGeneration(async (params) => {
          await lease.assertOwned();
          return sendMessage(params);
        }, 'StrategyCoachAgent');
        let output;
        try {
          output = await generateStrategy(strategyInput, generation.sendMessage);
        } catch (err) {
          if (err instanceof StrategyGenerationError) {
            request.log.warn(
              { err: err.message, rawResponse: err.rawResponse },
              'Strategy generation failed',
            );
            reply.code(502);
            return { error: 'Não foi possível gerar uma estratégia agora' };
          }
          const apiError = describeOpenAiApiError(err);
          if (apiError) {
            request.log.error({ err }, 'OpenAI API error during strategy generation');
            reply.code(apiError.status);
            return { error: apiError.message };
          }
          throw err;
        }

        // Clamp defensivo (belt-and-suspenders com o clamp em generateStrategy):
        // recommendedIntensity nunca pode ser persistido abaixo de 9, e targetRpe
        // sempre deve ser 10.
        output.recommendedIntensity = Math.min(10, Math.max(9, output.recommendedIntensity));
        output.targetRpe = 10;

        const strategy = await prisma.$transaction(async (tx) => {
          await lockWodVersions(tx, id);
          await lease.assertOwned(tx);
          const current = await tx.wodAnalysis.findUnique({ where: { wodId: id } });
          // Only promote a strategy if the analysis used by the AI is still active.
          if (current?.versionId !== analysisVersionId) return null;
          const saved = await tx.wodStrategy.upsert({
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
          return recordStrategyVersion(
            tx,
            wodWithAnalysis,
            saved,
            analysisVersionId,
            strategyInput,
            generation.metadata(),
          );
        });

        if (!strategy) {
          reply.code(409);
          return { error: 'A analise mudou durante a geracao. Gere a estrategia novamente.' };
        }

        return { strategy };
      },
    );
  });

  app.get('/wods/:id/strategy', async (request, reply) => {
    const { id } = request.params as { id: string };

    const wod = await prisma.wod.findFirst({
      where: { id, userId: request.user.sub, discipline: 'CROSSFIT' },
    });
    if (!wod) {
      return reply.code(404).send({ error: 'WOD não encontrado' });
    }

    const strategy = await prisma.wodStrategy.findUnique({ where: { wodId: id } });
    if (!strategy) {
      return reply.code(404).send({ error: 'Este WOD ainda não tem estratégia' });
    }

    return reply.send({ strategy });
  });
}
