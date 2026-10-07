import type { FastifyInstance } from 'fastify';
import { Prisma, prisma } from '@wod-coach-ai/database';
import { createOpenAiMessageSender, describeOpenAiApiError } from '@wod-coach-ai/ai';
import { analyzeWod, WodAnalysisError } from '@wod-coach-ai/coach-engine';
import { wodAnalysisUpdateSchema } from '@wod-coach-ai/validation';
import { z } from 'zod';
import {
  lockWodVersions,
  recordAnalysisVersion,
  WOD_VERSION_TRANSACTION_OPTIONS,
} from '../services/wod-version-service.js';
import { captureAiGeneration } from '../services/ai-generation-metadata.js';
import { runWodGeneration } from '../services/wod-generation-lease.js';

export default async function wodAnalysisRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.post('/wods/:id/analyze', async (request, reply) => {
    const { id } = request.params as { id: string };

    const wod = await prisma.wod.findFirst({
      where: { id, userId: request.user.sub, discipline: 'CROSSFIT' },
    });
    if (!wod) {
      return reply.code(404).send({ error: 'WOD não encontrado' });
    }

    return runWodGeneration(
      {
        wodId: wod.id,
        userId: request.user.sub,
        operation: 'ANALYSIS',
        onCleanupError: (err) => request.log.error({ err }, 'WOD generation lease cleanup failed'),
      },
      async (lease) => {
        let sendMessage;
        try {
          sendMessage = createOpenAiMessageSender();
        } catch {
          reply.code(503);
          return { error: 'A análise por IA ainda não foi configurada' };
        }

        const generation = captureAiGeneration(async (params) => {
          await lease.assertOwned();
          return sendMessage(params);
        }, 'WodAnalyzerAgent');
        let output;
        try {
          output = await analyzeWod(
            { rawText: wod.rawText, imageBase64: wod.imageData, imageMimeType: wod.imageMimeType },
            generation.sendMessage,
          );
        } catch (err) {
          if (err instanceof WodAnalysisError) {
            request.log.warn(
              { err: err.message, rawResponse: err.rawResponse },
              'WOD analysis failed',
            );
            reply.code(502);
            return {
              error:
                'Nao foi possivel confirmar a leitura deste WOD. Confira a foto ou o texto e informe o formato (ex.: For Time ou AMRAP) e o time cap, se houver. Tente analisar novamente; nenhuma analise anterior foi substituida.',
              code: 'WOD_ANALYSIS_INVALID_RESPONSE',
            };
          }
          const apiError = describeOpenAiApiError(err);
          if (apiError) {
            request.log.error({ err }, 'OpenAI API error during WOD analysis');
            reply.code(apiError.status);
            return { error: apiError.message };
          }
          throw err;
        }

        const persisted = await prisma.$transaction(async (tx) => {
          await lockWodVersions(tx, wod.id);
          await lease.assertOwned(tx);
          const currentWod = await tx.wod.findFirst({
            where: { id: wod.id, userId: request.user.sub, discipline: 'CROSSFIT' },
          });
          if (
            !currentWod ||
            currentWod.rawText !== wod.rawText ||
            currentWod.imageData !== wod.imageData ||
            currentWod.imageMimeType !== wod.imageMimeType
          ) {
            return null;
          }
          let analysis = await tx.wodAnalysis.upsert({
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
              roundBreakdown: output.rounds ?? Prisma.JsonNull,
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
              roundBreakdown: output.rounds ?? Prisma.JsonNull,
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
            include: { movements: { orderBy: { order: 'asc' } } },
          });

          analysis = await recordAnalysisVersion(tx, wod, analysis, 'AI', generation.metadata());

          // A strategy based on the previous analysis must not survive its replacement.
          await tx.wodStrategy.deleteMany({ where: { wodId: wod.id } });

          const extractedText = output.extractedText?.trim();
          const updatedWod =
            extractedText && !wod.rawText?.trim()
              ? await tx.wod.update({
                  where: { id: wod.id },
                  data: {
                    rawText: extractedText,
                    sourceType: wod.imageData ? 'TEXT_AND_IMAGE' : 'TEXT',
                  },
                  include: { result: true },
                })
              : null;

          return { analysis, wod: updatedWod };
        }, WOD_VERSION_TRANSACTION_OPTIONS);

        if (!persisted) {
          reply.code(409);
          return {
            error: 'O WOD mudou durante a analise. Atualize o treino e analise novamente.',
          };
        }
        const { analysis, wod: updatedWod } = persisted;
        return { analysis, wod: updatedWod };
      },
    );
  });

  app.patch('/wods/:id/analysis', async (request, reply) => {
    const { id } = request.params as { id: string };

    const wod = await prisma.wod.findFirst({
      where: { id, userId: request.user.sub, discipline: 'CROSSFIT' },
    });
    if (!wod) {
      return reply.code(404).send({ error: 'WOD não encontrado' });
    }

    const parsed = wodAnalysisUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Dados inválidos', details: parsed.error.flatten() });
    }

    const existing = await prisma.wodAnalysis.findUnique({ where: { wodId: id } });
    if (!existing) {
      return reply.code(404).send({ error: 'Este WOD ainda não foi analisado' });
    }

    const analysis = await prisma.$transaction(async (tx) => {
      await lockWodVersions(tx, id);
      const updated = await tx.wodAnalysis.update({
        where: { wodId: id },
        data: { durationMinutes: parsed.data.durationMinutes },
        include: { movements: { orderBy: { order: 'asc' } } },
      });
      const versioned = await recordAnalysisVersion(tx, wod, updated, 'DURATION_EDIT');
      await tx.wodStrategy.deleteMany({ where: { wodId: id } });
      return versioned;
    }, WOD_VERSION_TRANSACTION_OPTIONS);

    return reply.send({ analysis });
  });

  app.get('/wods/:id/versions', async (request, reply) => {
    const { id } = request.params as { id: string };
    const wod = await prisma.wod.findFirst({
      where: { id, userId: request.user.sub, discipline: 'CROSSFIT' },
      select: { id: true },
    });
    if (!wod) return reply.code(404).send({ error: 'WOD nao encontrado' });
    const query = z
      .object({
        analysisBefore: z.coerce.number().int().positive().optional(),
        strategyBefore: z.coerce.number().int().positive().optional(),
      })
      .safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Paginacao invalida' });
    const [analysisVersions, strategyVersions] = await Promise.all([
      prisma.wodAnalysisVersion.findMany({
        where: { wodId: id, version: { lt: query.data.analysisBefore } },
        orderBy: { version: 'desc' },
        take: 50,
      }),
      prisma.wodStrategyVersion.findMany({
        where: { wodId: id, version: { lt: query.data.strategyBefore } },
        orderBy: { version: 'desc' },
        take: 50,
      }),
    ]);
    return reply.send({
      analysisVersions,
      strategyVersions,
      nextAnalysisBefore: analysisVersions.length === 50 ? analysisVersions.at(-1)!.version : null,
      nextStrategyBefore: strategyVersions.length === 50 ? strategyVersions.at(-1)!.version : null,
    });
  });

  app.get('/wods/:id/analysis', async (request, reply) => {
    const { id } = request.params as { id: string };

    const wod = await prisma.wod.findFirst({
      where: { id, userId: request.user.sub, discipline: 'CROSSFIT' },
    });
    if (!wod) {
      return reply.code(404).send({ error: 'WOD não encontrado' });
    }

    const analysis = await prisma.wodAnalysis.findUnique({
      where: { wodId: id },
      include: { movements: { orderBy: { order: 'asc' } } },
    });

    if (!analysis) {
      return reply.code(404).send({ error: 'Este WOD ainda não foi analisado' });
    }

    return reply.send({ analysis });
  });
}
