import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma, prisma, type Prisma as PrismaTypes } from '@wod-coach-ai/database';
import { createOpenAiMessageSender, describeOpenAiApiError } from '@wod-coach-ai/ai';
import { analyzeWod, WodAnalysisError } from '@wod-coach-ai/coach-engine';
import {
  wodAnalysisUpdateSchema,
  wodSubmissionFieldsSchema,
  wodUpdateFieldsSchema,
  WOD_IMAGE_ALLOWED_MIME_TYPES,
} from '@wod-coach-ai/validation';
import { sendAiDailyLimitError } from '../services/ai-usage-limit-response.js';
import {
  AiDailyLimitExceededError,
  consumeAiDailyUsage,
} from '../services/ai-usage-limit-service.js';

interface ParsedSubmission {
  fields: Record<string, string>;
  imageBuffer: Buffer | null;
  imageMimeType: string | null;
}

async function parseMultipart(request: FastifyRequest): Promise<ParsedSubmission> {
  const fields: Record<string, string> = {};
  let imageBuffer: Buffer | null = null;
  let imageMimeType: string | null = null;

  for await (const part of request.parts()) {
    if (part.type === 'file') {
      if (!WOD_IMAGE_ALLOWED_MIME_TYPES.includes(part.mimetype)) {
        await part.toBuffer().catch(() => undefined);
        throw new UnsupportedImageTypeError(part.mimetype);
      }
      imageBuffer = await part.toBuffer();
      if (part.file.truncated) throw new ImageTooLargeError();
      imageMimeType = part.mimetype;
    } else {
      fields[part.fieldname] = part.value as string;
    }
  }

  return { fields, imageBuffer, imageMimeType };
}

class UnsupportedImageTypeError extends Error {
  constructor(mimetype: string) {
    super(`Tipo de imagem nao suportado: ${mimetype}`);
  }
}

class ImageTooLargeError extends Error {
  constructor() {
    super('A imagem excede o tamanho maximo permitido');
  }
}

const hyroxWorkoutListSelect = {
  id: true,
  userId: true,
  date: true,
  sourceType: true,
  discipline: true,
  rawText: true,
  imageMimeType: true,
  name: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  result: { select: { score: true } },
} as const;

export default async function hyroxWorkoutRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.post('/hyrox-workouts', async (request, reply) => {
    let parsed: ParsedSubmission;
    try {
      parsed = await parseMultipart(request);
    } catch (err) {
      if (err instanceof UnsupportedImageTypeError || err instanceof ImageTooLargeError) {
        return reply.code(400).send({ error: err.message });
      }
      throw err;
    }

    const fieldsResult = wodSubmissionFieldsSchema.safeParse(parsed.fields);
    if (!fieldsResult.success) {
      return reply
        .code(400)
        .send({ error: 'Dados invalidos', details: fieldsResult.error.flatten() });
    }

    const { rawText, name, notes, date } = fieldsResult.data;
    const hasImage = parsed.imageBuffer != null;
    if (!rawText && !hasImage) {
      return reply.code(400).send({ error: 'Envie o texto do treino HYROX ou uma imagem' });
    }

    const sourceType = rawText && hasImage ? 'TEXT_AND_IMAGE' : hasImage ? 'IMAGE' : 'TEXT';
    const workout = await prisma.wod.create({
      data: {
        userId: request.user.sub,
        date: date ?? new Date(),
        sourceType,
        discipline: 'HYROX',
        rawText,
        imageData: parsed.imageBuffer?.toString('base64'),
        imageMimeType: parsed.imageMimeType ?? undefined,
        name,
        notes,
      },
      select: hyroxWorkoutListSelect,
    });

    return reply.code(201).send({ workout });
  });

  app.get('/hyrox-workouts', async (request, reply) => {
    const query = request.query as { limit?: string };
    const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);
    const workouts = await prisma.wod.findMany({
      where: { userId: request.user.sub, discipline: 'HYROX' },
      orderBy: { date: 'desc' },
      take: limit,
      select: hyroxWorkoutListSelect,
    });

    return reply.send({ workouts });
  });

  app.get('/hyrox-workouts/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const workout = await prisma.wod.findFirst({
      where: { id, userId: request.user.sub, discipline: 'HYROX' },
      include: { result: true },
    });

    if (!workout) return reply.code(404).send({ error: 'Treino HYROX nao encontrado' });
    return reply.send({ workout });
  });

  app.put('/hyrox-workouts/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.wod.findFirst({
      where: { id, userId: request.user.sub, discipline: 'HYROX' },
    });
    if (!existing) return reply.code(404).send({ error: 'Treino HYROX nao encontrado' });

    const parsed = wodUpdateFieldsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Dados invalidos', details: parsed.error.flatten() });
    }

    const { rawText, name, notes } = parsed.data;
    const rawTextChanged = rawText !== undefined && rawText !== existing.rawText;
    const workout = await prisma.$transaction(async (tx: PrismaTypes.TransactionClient) => {
      if (rawTextChanged) {
        await tx.wodAnalysis.deleteMany({ where: { wodId: id } });
        await tx.hyroxStrategy.deleteMany({ where: { wodId: id } });
      }

      return tx.wod.update({
        where: { id },
        data: { rawText, name, notes },
        select: hyroxWorkoutListSelect,
      });
    });

    return reply.send({ workout });
  });

  app.delete('/hyrox-workouts/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.wod.findFirst({
      where: { id, userId: request.user.sub, discipline: 'HYROX' },
    });
    if (!existing) return reply.code(404).send({ error: 'Treino HYROX nao encontrado' });

    await prisma.wod.delete({ where: { id } });
    return reply.code(204).send();
  });

  app.post('/hyrox-workouts/:id/analyze', async (request, reply) => {
    const { id } = request.params as { id: string };
    const workout = await prisma.wod.findFirst({
      where: { id, userId: request.user.sub, discipline: 'HYROX' },
    });
    if (!workout) return reply.code(404).send({ error: 'Treino HYROX nao encontrado' });

    let sendMessage;
    try {
      sendMessage = createOpenAiMessageSender();
    } catch {
      return reply.code(503).send({ error: 'A analise por IA ainda nao foi configurada' });
    }

    try {
      await consumeAiDailyUsage(request.user.sub);
    } catch (err) {
      if (err instanceof AiDailyLimitExceededError) {
        return sendAiDailyLimitError(reply, err);
      }
      throw err;
    }

    let output;
    try {
      output = await analyzeWod(
        {
          rawText: workout.rawText,
          imageBase64: workout.imageData,
          imageMimeType: workout.imageMimeType,
        },
        sendMessage,
      );
    } catch (err) {
      if (err instanceof WodAnalysisError) {
        request.log.warn(
          { err: err.message, rawResponse: err.rawResponse },
          'HYROX workout analysis failed',
        );
        return reply.code(502).send({ error: 'Nao foi possivel analisar este treino HYROX agora' });
      }
      const apiError = describeOpenAiApiError(err);
      if (apiError) {
        request.log.error({ err }, 'OpenAI API error during HYROX workout analysis');
        return reply.code(apiError.status).send({ error: apiError.message });
      }
      throw err;
    }

    const analysis = await prisma.wodAnalysis.upsert({
      where: { wodId: workout.id },
      create: {
        wodId: workout.id,
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

    const extractedText = output.extractedText?.trim();
    const updatedWorkout =
      extractedText && !workout.rawText?.trim()
        ? await prisma.wod.update({
            where: { id: workout.id },
            data: {
              rawText: extractedText,
              sourceType: workout.imageData ? 'TEXT_AND_IMAGE' : 'TEXT',
            },
            include: { result: true },
          })
        : null;

    return reply.send({ analysis, workout: updatedWorkout });
  });

  app.get('/hyrox-workouts/:id/analysis', async (request, reply) => {
    const { id } = request.params as { id: string };
    const workout = await prisma.wod.findFirst({
      where: { id, userId: request.user.sub, discipline: 'HYROX' },
    });
    if (!workout) return reply.code(404).send({ error: 'Treino HYROX nao encontrado' });

    const analysis = await prisma.wodAnalysis.findUnique({
      where: { wodId: id },
      include: { movements: { orderBy: { order: 'asc' } } },
    });
    if (!analysis) return reply.code(404).send({ error: 'Este treino ainda nao foi analisado' });

    return reply.send({ analysis });
  });

  app.patch('/hyrox-workouts/:id/analysis', async (request, reply) => {
    const { id } = request.params as { id: string };
    const workout = await prisma.wod.findFirst({
      where: { id, userId: request.user.sub, discipline: 'HYROX' },
    });
    if (!workout) return reply.code(404).send({ error: 'Treino HYROX nao encontrado' });

    const parsed = wodAnalysisUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Dados invalidos', details: parsed.error.flatten() });
    }

    const existing = await prisma.wodAnalysis.findUnique({ where: { wodId: id } });
    if (!existing) return reply.code(404).send({ error: 'Este treino ainda nao foi analisado' });

    const [analysis] = await prisma.$transaction([
      prisma.wodAnalysis.update({
        where: { wodId: id },
        data: { durationMinutes: parsed.data.durationMinutes },
        include: { movements: { orderBy: { order: 'asc' } } },
      }),
      prisma.hyroxStrategy.deleteMany({ where: { wodId: id } }),
    ]);

    return reply.send({ analysis });
  });
}
