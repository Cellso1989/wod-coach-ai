import {
  Prisma,
  type Wod,
  type WodAnalysis,
  type WodMovement,
  type WodStrategy,
} from '@wod-coach-ai/database';
import type { StrategyCoachInput } from '@wod-coach-ai/coach-engine';
import type { AiGenerationMetadata } from './ai-generation-metadata.js';

type AnalysisWithMovements = WodAnalysis & { movements: WodMovement[] };

function jsonSnapshot(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function sourceSnapshot(wod: Wod) {
  return jsonSnapshot({
    id: wod.id,
    date: wod.date,
    sourceType: wod.sourceType,
    rawText: wod.rawText,
    imageData: wod.imageData,
    imageMimeType: wod.imageMimeType,
    name: wod.name,
    notes: wod.notes,
  });
}

// Serialize per-WOD version allocation across analysis, edits and strategy writes.
export async function lockWodVersions(tx: Prisma.TransactionClient, wodId: string) {
  await tx.$queryRaw`SELECT "id" FROM "wods" WHERE "id" = ${wodId} FOR UPDATE`;
}

export async function recordAnalysisVersion(
  tx: Prisma.TransactionClient,
  wod: Wod,
  analysis: AnalysisWithMovements,
  reason: 'AI' | 'DURATION_EDIT',
  generationMetadata?: AiGenerationMetadata,
) {
  const latest = await tx.wodAnalysisVersion.findFirst({
    where: { wodId: wod.id },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const version = await tx.wodAnalysisVersion.create({
    data: {
      wodId: wod.id,
      version: (latest?.version ?? 0) + 1,
      reason,
      sourceSnapshot: sourceSnapshot(wod),
      snapshot: jsonSnapshot({
        ...analysis,
        versionId: undefined,
        generationMetadata: generationMetadata ?? null,
      }),
    },
  });
  return tx.wodAnalysis.update({
    where: { wodId: wod.id },
    data: { versionId: version.id },
    include: { movements: { orderBy: { order: 'asc' } } },
  });
}

export async function recordStrategyVersion(
  tx: Prisma.TransactionClient,
  wod: Wod,
  strategy: WodStrategy,
  analysisVersionId: string,
  input: StrategyCoachInput,
  generationMetadata?: AiGenerationMetadata,
) {
  const latest = await tx.wodStrategyVersion.findFirst({
    where: { wodId: wod.id },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const version = await tx.wodStrategyVersion.create({
    data: {
      wodId: wod.id,
      version: (latest?.version ?? 0) + 1,
      analysisVersionId,
      sourceSnapshot: sourceSnapshot(wod),
      inputSnapshot: jsonSnapshot(input),
      snapshot: jsonSnapshot({
        ...strategy,
        versionId: undefined,
        generationMetadata: generationMetadata ?? null,
      }),
    },
  });
  return tx.wodStrategy.update({ where: { wodId: wod.id }, data: { versionId: version.id } });
}
