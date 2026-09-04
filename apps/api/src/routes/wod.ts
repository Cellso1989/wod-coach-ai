import type { FastifyInstance, FastifyRequest } from "fastify";
import { prisma } from "@wod-coach-ai/database";
import {
  wodSubmissionFieldsSchema,
  wodUpdateFieldsSchema,
  WOD_IMAGE_ALLOWED_MIME_TYPES,
} from "@wod-coach-ai/validation";

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
    if (part.type === "file") {
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
    super("A imagem excede o tamanho máximo permitido");
  }
}

export default async function wodRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.post("/wods", async (request, reply) => {
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
        .send({ error: "Dados inválidos", details: fieldsResult.error.flatten() });
    }

    const { rawText, name, notes, date } = fieldsResult.data;
    const hasImage = parsed.imageBuffer != null;

    if (!rawText && !hasImage) {
      return reply
        .code(400)
        .send({ error: "Envie o texto do WOD ou uma imagem do treino" });
    }

    const sourceType = rawText && hasImage ? "TEXT_AND_IMAGE" : hasImage ? "IMAGE" : "TEXT";

    const wod = await prisma.wod.create({
      data: {
        userId: request.user.sub,
        date: date ?? new Date(),
        sourceType,
        rawText,
        imageData: parsed.imageBuffer?.toString("base64"),
        imageMimeType: parsed.imageMimeType ?? undefined,
        name,
        notes,
      },
      select: wodListSelect,
    });

    return reply.code(201).send({ wod });
  });

  app.get("/wods", async (request, reply) => {
    const query = request.query as { limit?: string };
    const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);

    const wods = await prisma.wod.findMany({
      where: { userId: request.user.sub },
      orderBy: { date: "desc" },
      take: limit,
      select: wodListSelect,
    });

    return reply.send({ wods });
  });

  app.get("/wods/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const wod = await prisma.wod.findFirst({
      where: { id, userId: request.user.sub },
      include: {
        result: { include: { feedback: true } },
      },
    });

    if (!wod) {
      return reply.code(404).send({ error: "WOD não encontrado" });
    }

    return reply.send({ wod });
  });

  app.put("/wods/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.wod.findFirst({
      where: { id, userId: request.user.sub },
    });
    if (!existing) {
      return reply.code(404).send({ error: "WOD não encontrado" });
    }

    const parsed = wodUpdateFieldsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: parsed.error.flatten() });
    }

    const { rawText, name, notes } = parsed.data;
    const rawTextChanged = rawText !== undefined && rawText !== existing.rawText;

    const wod = await prisma.$transaction(async (tx) => {
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

    return reply.send({ wod });
  });

  app.delete("/wods/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.wod.findFirst({
      where: { id, userId: request.user.sub },
    });
    if (!existing) {
      return reply.code(404).send({ error: "WOD não encontrado" });
    }

    await prisma.wod.delete({ where: { id } });

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
  result: { select: { score: true, rpe: true } },
} as const;
