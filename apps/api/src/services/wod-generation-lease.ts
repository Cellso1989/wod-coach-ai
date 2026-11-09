import { randomUUID } from 'node:crypto';
import { prisma, type Prisma } from '@wod-coach-ai/database';
import { withoutDatabaseTiming, type MeasureWodDatabase } from './wod-database-timing.js';
import type { JobFence } from './wod-generation-jobs.js';

export class WodGenerationConflictError extends Error {}
/** Only a failed initial claim; ownership loss during work remains a conflict. */
export class WodGenerationUnavailableError extends WodGenerationConflictError {}

interface GenerationLease {
  assertOwned: (tx?: Prisma.TransactionClient) => Promise<void>;
}

export async function runWodGeneration<T>(
  options: {
    wodId: string;
    userId: string;
    operation: 'ANALYSIS' | 'STRATEGY';
    onCleanupError: (error: unknown) => void;
    measureDatabase?: MeasureWodDatabase;
    job?: JobFence | null;
  },
  work: (lease: GenerationLease) => Promise<T>,
): Promise<T> {
  const { wodId, userId, operation } = options;
  const measure = options.measureDatabase ?? withoutDatabaseTiming;
  const token = randomUUID();
  const jobId = options.job?.id ?? null;
  const jobToken = options.job?.token ?? null;
  // One bounded reservation per WOD, shared across processes and both AI routes.
  const claimed = await measure(
    'lease.claim',
    () => prisma.$queryRaw<Array<{ token: string }>>`
    WITH args AS (SELECT ${token}::text AS token, ${operation}::text AS operation, ${wodId}::text AS id, ${userId}::text AS "userId"),
    owned AS (SELECT w."id",w."userId",w."updatedAt" FROM "wods" w JOIN args ON w."id"=args.id AND w."userId"=args."userId" WHERE w."discipline"='CROSSFIT' FOR UPDATE OF w)
    INSERT INTO "wod_generation_leases" ("wodId", "token", "operation", "expiresAt")
    SELECT w."id", args.token, args.operation, clock_timestamp() + INTERVAL '10 minutes'
    FROM owned w CROSS JOIN args WHERE (
      (${jobId}::text IS NULL AND NOT EXISTS (SELECT 1 FROM "wod_generation_jobs" j WHERE j."wodId"=w."id" AND j."status" IN ('PENDING','RUNNING') AND j."expiresAt">clock_timestamp()))
      OR EXISTS (SELECT 1 FROM "wod_generation_jobs" j WHERE j."id"=${jobId} AND j."token"=${jobToken} AND j."wodId"=w."id" AND j."userId"=w."userId" AND j."operation"=${operation}
        AND j."status"='RUNNING' AND j."expiresAt">clock_timestamp() AND j."sourceUpdatedAt"=w."updatedAt"
        AND (SELECT a."versionId" FROM "wod_analyses" a WHERE a."wodId"=w."id") IS NOT DISTINCT FROM j."analysisVersionId")
    )
    ON CONFLICT ("wodId") DO UPDATE SET
      "token" = EXCLUDED."token", "operation" = EXCLUDED."operation", "expiresAt" = EXCLUDED."expiresAt"
    WHERE "wod_generation_leases"."expiresAt" <= clock_timestamp()
    RETURNING "token"
  `,
  );
  if (claimed.length === 0) {
    throw new WodGenerationUnavailableError(
      'Este WOD ja tem uma geracao em andamento ou nao esta mais disponivel. Aguarde e atualize o treino.',
    );
  }

  async function assertOwned(tx?: Prisma.TransactionClient) {
    // Promotion locks this row until commit, so an expired owner cannot overwrite its successor.
    const database = tx ?? prisma;
    const rows = await measure('lease.assert', async () =>
      jobId
        ? await database.$queryRaw<Array<{ token: string }>>`
        SELECT l."token" FROM "wod_generation_leases" l JOIN "wod_generation_jobs" j ON j."id"=${jobId} AND j."token"=${jobToken}
        JOIN "wods" w ON w."id"=j."wodId" AND w."userId"=j."userId"
        WHERE l."wodId"=${wodId} AND l."token"=${token} AND l."expiresAt">clock_timestamp()
          AND j."wodId"=l."wodId" AND j."status"='RUNNING' AND j."expiresAt">clock_timestamp()
          AND j."operation"=l."operation" AND j."sourceUpdatedAt"=w."updatedAt"
          AND (SELECT a."versionId" FROM "wod_analyses" a WHERE a."wodId"=w."id") IS NOT DISTINCT FROM j."analysisVersionId"
        FOR UPDATE OF l,j
      `
        : tx
          ? await tx.$queryRaw<Array<{ token: string }>>`
          SELECT "token" FROM "wod_generation_leases"
          WHERE "wodId" = ${wodId} AND "token" = ${token} AND "expiresAt" > clock_timestamp()
          FOR UPDATE
        `
          : await prisma.$queryRaw<Array<{ token: string }>>`
          SELECT "token" FROM "wod_generation_leases"
          WHERE "wodId" = ${wodId} AND "token" = ${token} AND "expiresAt" > clock_timestamp()
        `,
    );
    if (rows.length === 0) {
      throw new WodGenerationConflictError(
        'A reserva de geracao expirou ou foi substituida. Atualize o treino e tente novamente.',
      );
    }
  }

  try {
    return await work({ assertOwned });
  } finally {
    try {
      await measure(
        'lease.release',
        () => prisma.$queryRaw`
        DELETE FROM "wod_generation_leases" WHERE "wodId" = ${wodId} AND "token" = ${token}
        RETURNING "token"
      `,
      );
    } catch (error) {
      // Do not mask the original failure or turn a committed result into an ambiguous retry.
      options.onCleanupError(error);
    }
  }
}
