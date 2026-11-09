import { randomUUID, createHmac } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma, Prisma, type WodGenerationJob } from '@wod-coach-ai/database';
import { wodMeasurementId } from './wod-generation-http-timing.js';

export type JobFence = { id: string; token: string };
export function generationJobFence(request: FastifyRequest): JobFence | null {
  const { generationJobId: id, generationJobToken: token } = request.user;
  return id && token ? { id, token } : null;
}
export function wantsQueuedGeneration(request: FastifyRequest) {
  return (
    process.env.WOD_GENERATION_QUEUE_ENABLED === 'true' &&
    request.headers['x-wod-async'] === '1' &&
    !generationJobFence(request)
  );
}
export class GenerationJobAdmissionError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export async function enqueueGeneration(
  request: FastifyRequest,
  operation: 'ANALYSIS' | 'STRATEGY',
) {
  const { id: wodId } = request.params as { id: string };
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; updatedAt: Date }>>`
      SELECT "id", "updatedAt" FROM "wods" WHERE "id"=${wodId} AND "userId"=${request.user.sub}
      AND "discipline"='CROSSFIT' FOR UPDATE`;
      const wod = rows[0];
      if (!wod) throw new GenerationJobAdmissionError(404, 'WOD não encontrado');
      const [state] = await tx.$queryRaw<
        Array<{ busy: boolean; analysisVersionId: string | null }>
      >`
      SELECT EXISTS (SELECT "wodId" FROM "wod_generation_leases" WHERE "wodId"=${wodId} AND "expiresAt">clock_timestamp()
      UNION ALL SELECT "wodId" FROM "wod_generation_jobs" WHERE "wodId"=${wodId} AND "status" IN ('PENDING','RUNNING') AND "expiresAt">clock_timestamp()) AS busy,
      (SELECT "versionId" FROM "wod_analyses" WHERE "wodId"=${wodId}) AS "analysisVersionId"`;
      if (!state) throw new Error('Generation admission state unavailable');
      if (state.busy)
        throw new GenerationJobAdmissionError(
          409,
          'Este WOD já tem uma geração em andamento. Aguarde.',
        );
      if (operation === 'STRATEGY' && !state.analysisVersionId)
        throw new GenerationJobAdmissionError(
          409,
          'Analise este WOD antes de gerar uma estratégia',
        );
      const job = await tx.wodGenerationJob.create({
        data: {
          wodId,
          userId: request.user.sub,
          operation,
          sourceUpdatedAt: wod.updatedAt,
          analysisVersionId: state.analysisVersionId,
          measurementId: wodMeasurementId(request),
          expiresAt: new Date(Date.now() + 10 * 60_000),
        },
        select: { id: true },
      });
      return { queued: true as const, jobId: job.id };
    },
    { timeout: 15_000 },
  );
}

export async function claimGenerationJob(): Promise<WodGenerationJob | null> {
  // A crash never replays an uncertain provider call. A new user request is required.
  const token = randomUUID();
  const rows = await prisma.$queryRaw<WodGenerationJob[]>`
    WITH stale AS (SELECT "id" FROM "wod_generation_jobs" WHERE "status" IN ('PENDING','RUNNING') AND "expiresAt"<=clock_timestamp() FOR UPDATE SKIP LOCKED LIMIT 100),
    expired AS (UPDATE "wod_generation_jobs" j SET "status"='FAILED', "statusCode"=504,
      "finishedAt"=clock_timestamp(), "token"=NULL, "result"='{"error":"A geração expirou. Atualize o treino antes de tentar novamente."}'::jsonb
      FROM stale WHERE j."id"=stale."id"),
    next AS (SELECT "id" FROM "wod_generation_jobs" WHERE "status"='PENDING' AND "expiresAt">clock_timestamp()
      ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1)
    UPDATE "wod_generation_jobs" j SET "status"='RUNNING', "token"=${token},
      "startedAt"=clock_timestamp(), "expiresAt"=clock_timestamp()+INTERVAL '10 minutes'
    FROM next WHERE j."id"=next."id" RETURNING j.*`;
  return rows[0] ?? null;
}
export async function pruneGenerationJobs() {
  await prisma.$executeRaw`DELETE FROM "wod_generation_jobs" WHERE "id" IN
    (SELECT "id" FROM "wod_generation_jobs" WHERE "status" IN ('SUCCEEDED','FAILED') AND "finishedAt"<clock_timestamp()-INTERVAL '24 hours' LIMIT 1000)`;
}

export async function executeGenerationJob(app: FastifyInstance, job: WodGenerationJob) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('Worker authentication is not configured');
  const now = Math.floor(Date.now() / 1000);
  const encoded = [
    { alg: 'HS256', typ: 'JWT' },
    {
      sub: job.userId,
      generationJobId: job.id,
      generationJobToken: job.token!,
      iat: now,
      exp: now + 11 * 60,
    },
  ]
    .map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'))
    .join('.');
  const token = `${encoded}.${createHmac('sha256', secret).update(encoded).digest('base64url')}`;
  let statusCode = 500;
  let result: Prisma.InputJsonValue = {
    error: 'Não foi possível concluir a geração. Atualize o treino antes de tentar novamente.',
  };
  try {
    const response = await app.inject({
      method: 'POST',
      url: `/api/wods/${encodeURIComponent(job.wodId)}/${job.operation === 'ANALYSIS' ? 'analyze' : 'strategy'}`,
      headers: {
        authorization: `Bearer ${token}`,
        'x-wod-response-compact': '1',
        ...(job.measurementId ? { 'x-wod-measurement-id': job.measurementId } : {}),
      },
    });
    statusCode = response.statusCode;
    result = response.json() as Prisma.InputJsonValue;
  } catch {
    /* No automatic retry; leave a bounded, opaque failure. */
  }
  const completed = await prisma.wodGenerationJob.updateMany({
    where: { id: job.id, status: 'RUNNING', token: job.token, expiresAt: { gt: new Date() } },
    data: {
      status: statusCode < 400 ? 'SUCCEEDED' : 'FAILED',
      statusCode,
      result,
      finishedAt: new Date(),
      token: null,
    },
  });
  if (!completed.count) statusCode = 504;
  app.log.info(
    {
      event: 'wod_generation_job_timing',
      schemaVersion: 1,
      measurementId: job.measurementId,
      operation: job.operation,
      statusCode,
      resultRecorded: completed.count === 1,
      queueWaitMs: job.startedAt!.getTime() - job.createdAt.getTime(),
      durationMs: Date.now() - job.createdAt.getTime(),
    },
    'CrossFit queued generation timing',
  );
}
