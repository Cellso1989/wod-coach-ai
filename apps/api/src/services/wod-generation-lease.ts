import { randomUUID } from 'node:crypto';
import { prisma, type Prisma } from '@wod-coach-ai/database';

export class WodGenerationConflictError extends Error {}

interface GenerationLease {
  assertOwned: (tx?: Prisma.TransactionClient) => Promise<void>;
}

export async function runWodGeneration<T>(
  options: {
    wodId: string;
    userId: string;
    operation: 'ANALYSIS' | 'STRATEGY';
    onCleanupError: (error: unknown) => void;
  },
  work: (lease: GenerationLease) => Promise<T>,
): Promise<T> {
  const { wodId, userId, operation } = options;
  const token = randomUUID();
  // One bounded reservation per WOD, shared across processes and both AI routes.
  const claimed = await prisma.$queryRaw<Array<{ token: string }>>`
    INSERT INTO "wod_generation_leases" ("wodId", "token", "operation", "expiresAt")
    SELECT "id", ${token}, ${operation}, clock_timestamp() + INTERVAL '10 minutes'
    FROM "wods" WHERE "id" = ${wodId} AND "userId" = ${userId} AND "discipline" = 'CROSSFIT'
    ON CONFLICT ("wodId") DO UPDATE SET
      "token" = EXCLUDED."token", "operation" = EXCLUDED."operation", "expiresAt" = EXCLUDED."expiresAt"
    WHERE "wod_generation_leases"."expiresAt" <= clock_timestamp()
    RETURNING "token"
  `;
  if (claimed.length === 0) {
    throw new WodGenerationConflictError(
      'Este WOD ja tem uma geracao em andamento ou nao esta mais disponivel. Aguarde e atualize o treino.',
    );
  }

  async function assertOwned(tx?: Prisma.TransactionClient) {
    // Promotion locks this row until commit, so an expired owner cannot overwrite its successor.
    const rows = tx
      ? await tx.$queryRaw<Array<{ token: string }>>`
          SELECT "token" FROM "wod_generation_leases"
          WHERE "wodId" = ${wodId} AND "token" = ${token} AND "expiresAt" > clock_timestamp()
          FOR UPDATE
        `
      : await prisma.$queryRaw<Array<{ token: string }>>`
          SELECT "token" FROM "wod_generation_leases"
          WHERE "wodId" = ${wodId} AND "token" = ${token} AND "expiresAt" > clock_timestamp()
        `;
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
      await prisma.$queryRaw`
        DELETE FROM "wod_generation_leases" WHERE "wodId" = ${wodId} AND "token" = ${token}
        RETURNING "token"
      `;
    } catch (error) {
      // Do not mask the original failure or turn a committed result into an ambiguous retry.
      options.onCleanupError(error);
    }
  }
}
