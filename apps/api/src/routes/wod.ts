import type { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma, Prisma } from '@wod-coach-ai/database';
import {
  wodSubmissionFieldsSchema,
  wodUpdateFieldsSchema,
  WOD_IMAGE_ALLOWED_MIME_TYPES,
} from '@wod-coach-ai/validation';
import { lockWodVersions } from '../services/wod-version-service.js';
import { optimizeWodImage } from '../services/wod-image.js';
import { randomUUID } from 'node:crypto';
import {
  storeWodImage,
  readWodImage,
  deleteWodImage,
  wodSourceResponse,
} from '../services/wod-image-storage.js';

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
        // Drain the stream so the request doesn't hang, then reject.
        await part.toBuffer().catch(() => undefined);
        throw new UnsupportedImageTypeError(part.mimetype);
      }
      imageBuffer = await part.toBuffer();
      if (part.file.truncated) {
        throw new ImageTooLargeError();
      }
      imageMimeType = part.mimetype;
    } else {
      fields[part.fieldname] = part.value as string;
    }
  }

  return { fields, imageBuffer, imageMimeType };
}

class UnsupportedImageTypeError extends Error {
  constructor(mimetype: string) {
    super(`Tipo de imagem não suportado: ${mimetype}`);
  }
}

class ImageTooLargeError extends Error {
  constructor() {
    super('A imagem excede o tamanho máximo permitido');
  }
}

export default async function wodRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.post('/wods', async (request, reply) => {
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
        .send({ error: 'Dados inválidos', details: fieldsResult.error.flatten() });
    }

    const { rawText, name, notes, date } = fieldsResult.data;
    const hasImage = parsed.imageBuffer != null;

    if (!rawText && !hasImage) {
      return reply.code(400).send({ error: 'Envie o texto do WOD ou uma imagem do treino' });
    }

    const sourceType = rawText && hasImage ? 'TEXT_AND_IMAGE' : hasImage ? 'IMAGE' : 'TEXT';

    const image =
      parsed.imageBuffer && parsed.imageMimeType
        ? await optimizeWodImage(parsed.imageBuffer, parsed.imageMimeType)
        : null;
    if (image) {
      request.log.info(
        {
          event: 'wod_image_optimization',
          originalBytes: image.originalBytes,
          storedBytes: image.storedBytes,
          durationMs: image.durationMs,
          optimized: image.optimized,
        },
        'WOD image optimization',
      );
    }

    const id = randomUUID();
    const storedImage = image
      ? await storeWodImage(request.user.sub, id, image.buffer, image.mimeType)
      : null;
    let wod;
    try {
      wod = await prisma.wod.create({
        data: {
          id,
          userId: request.user.sub,
          date: date ?? new Date(),
          sourceType,
          discipline: 'CROSSFIT',
          rawText,
          ...(storedImage ?? {}),
          name,
          notes,
        },
        select: wodListSelect,
      });
    } catch (error) {
      if (storedImage?.imageStorageKey) {
        try {
          // A lost DB acknowledgement can follow a successful commit. Never delete its photo.
          const committed = await prisma.wod.findFirst({
            where: { id, userId: request.user.sub },
            select: { imageStorageKey: true },
          });
          if (!committed)
            await deleteWodImage({
              id,
              userId: request.user.sub,
              imageStorageKey: storedImage.imageStorageKey,
            });
        } catch {
          request.log.error({ code: 'WOD_IMAGE_CLEANUP_FAILED' }, 'Image cleanup failed');
        }
      }
      throw error;
    }

    return reply.code(201).send({ wod });
  });

  app.get('/wods', async (request, reply) => {
    const query = request.query as { limit?: string };
    const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);

    const wods = await prisma.wod.findMany({
      where: { userId: request.user.sub, discipline: 'CROSSFIT' },
      orderBy: { date: 'desc' },
      take: limit,
      select: wodListSelect,
    });

    return reply.send({ wods });
  });

  app.get('/wods/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    if ((request.query as { view?: string }).view === 'detail') {
      // One HTTP read, with all active projections from the same database snapshot.
      // Keep image bytes out of the JSON needed to display the workout/strategy.
      const detail = await prisma.$transaction(
        (tx) =>
          tx.wod.findFirst({
            where: { id, userId: request.user.sub, discipline: 'CROSSFIT' },
            select: {
              ...wodListSelect,
              result: true,
              analysis: { include: { movements: { orderBy: { order: 'asc' } } } },
              strategy: true,
            },
          }),
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      );
      if (!detail) return reply.code(404).send({ error: 'WOD não encontrado' });
      const { analysis, strategy, ...wod } = detail;
      return reply
        .header('Cache-Control', 'no-store')
        .send({ detailVersion: 1, wod, analysis, strategy });
    }

    const wod = await prisma.wod.findFirst({
      where: { id, userId: request.user.sub, discipline: 'CROSSFIT' },
      include: {
        result: true,
      },
    });

    if (!wod) {
      return reply.code(404).send({ error: 'WOD não encontrado' });
    }

    const publicWod = wodSourceResponse(wod);
    if (wod.imageStorageKey)
      publicWod.imageData = (await readWodImage(wod))?.toString('base64') ?? null;
    return reply.header('Cache-Control', 'private, no-store').send({ wod: publicWod });
  });

  app.get('/wods/:id/image', async (request, reply) => {
    const { id } = request.params as { id: string };
    const wod = await prisma.wod.findFirst({
      where: { id, userId: request.user.sub, discipline: 'CROSSFIT' },
      select: {
        id: true,
        userId: true,
        imageData: true,
        imageMimeType: true,
        imageStorageKey: true,
        imageSha256: true,
      },
    });
    if (
      !wod ||
      (!wod.imageData && !wod.imageStorageKey) ||
      !wod.imageMimeType ||
      !WOD_IMAGE_ALLOWED_MIME_TYPES.includes(wod.imageMimeType)
    ) {
      return reply.code(404).send({ error: 'Foto do treino não encontrada' });
    }
    const bytes = await readWodImage(wod);
    if (!bytes) return reply.code(404).send({ error: 'Foto do treino não encontrada' });
    return reply.header('Cache-Control', 'private, no-store').type(wod.imageMimeType).send(bytes);
  });

  app.put('/wods/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.wod.findFirst({
      where: { id, userId: request.user.sub, discipline: 'CROSSFIT' },
    });
    if (!existing) {
      return reply.code(404).send({ error: 'WOD não encontrado' });
    }

    const parsed = wodUpdateFieldsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Dados inválidos', details: parsed.error.flatten() });
    }

    const { rawText, name, notes } = parsed.data;

    const wod = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await lockWodVersions(tx, id);
      const current = await tx.wod.findFirst({
        where: { id, userId: request.user.sub, discipline: 'CROSSFIT' },
        select: { rawText: true },
      });
      if (!current) return null;
      const rawTextChanged = rawText !== undefined && rawText !== current.rawText;
      if (rawTextChanged) {
        // O texto mudou: a análise e a estratégia anteriores não valem mais.
        await tx.wodAnalysis.deleteMany({ where: { wodId: id } });
        await tx.wodStrategy.deleteMany({ where: { wodId: id } });
      }

      return tx.wod.update({
        where: { id },
        data: { rawText, name, notes },
        select: wodListSelect,
      });
    });

    if (!wod) return reply.code(404).send({ error: 'WOD nao encontrado' });
    return reply.send({ wod });
  });

  app.delete('/wods/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.wod.findFirst({
      where: { id, userId: request.user.sub, discipline: 'CROSSFIT' },
    });
    if (!existing) {
      return reply.code(404).send({ error: 'WOD não encontrado' });
    }

    await prisma.wod.delete({ where: { id } });
    await deleteWodImage(existing).catch(() =>
      request.log.error({ code: 'WOD_IMAGE_CLEANUP_FAILED' }, 'Image cleanup failed'),
    );

    return reply.code(204).send();
  });
}

// Nas listagens não retornamos imageData (base64 grande) para manter o
// payload leve; o detalhe (GET /wods/:id) retorna o WOD completo.
const wodListSelect = {
  id: true,
  userId: true,
  date: true,
  sourceType: true,
  rawText: true,
  imageMimeType: true,
  name: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  result: { select: { score: true } },
} as const;
