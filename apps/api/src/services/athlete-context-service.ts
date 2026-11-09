import { prisma, type Wod, type WodAnalysis, type WodMovement } from '@wod-coach-ai/database';
import {
  buildAthleteContext,
  type AthleteContext,
  type HistoricalStrategySummary,
  type HistoricalWodEntry,
  type WodAnalysisSummary,
} from '@wod-coach-ai/coach-engine';
import { withoutDatabaseTiming, type MeasureWodDatabase } from './wod-database-timing.js';
import type { AthleteStrategyBasics } from './athlete-strategy-basics.js';

const HISTORY_WINDOW_DAYS = 90;
const CHECKIN_WINDOW_DAYS = 28;

export class WodNotFoundError extends Error {}
export class WodNotAnalyzedError extends Error {}

function readResult<T>(result: PromiseSettledResult<T>): T {
  if (result.status === 'rejected') throw result.reason;
  return result.value;
}

/**
 * Loads the target WOD (with its analysis) plus the athlete's recent
 * history, and assembles the AthleteContext (Fase 7). Shared between
 * GET /wods/:id/context and the StrategyCoachAgent route (Fase 8) so
 * the same data-fetching isn't duplicated across routes.
 */
export async function getAthleteContextForWod(
  userId: string,
  wodId: string,
  measure: MeasureWodDatabase = withoutDatabaseTiming,
  options: { parallelHistory?: boolean; basics?: Promise<AthleteStrategyBasics> } = {},
): Promise<{
  targetWod: Wod & { analysis: WodAnalysis & { movements: WodMovement[] } };
  targetAnalysis: WodAnalysisSummary;
  context: AthleteContext;
}> {
  const loadTarget = async () => {
    const targetWod = await measure('context.target', () =>
      prisma.wod.findFirst({
        where: { id: wodId, userId },
        include: { analysis: { include: { movements: true } } },
      }),
    );

    if (!targetWod) {
      throw new WodNotFoundError();
    }
    if (!targetWod.analysis) {
      throw new WodNotAnalyzedError();
    }

    return { ...targetWod, analysis: targetWod.analysis };
  };
  const loadHistory = async () => {
    const historyCutoff = new Date(Date.now() - HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const checkinCutoff = new Date(Date.now() - CHECKIN_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    // Finish every in-flight read before the caller releases its generation lease
    // or writes the timing event, even if one of the parallel reads fails.
    const reads = await Promise.allSettled([
      measure('context.history', () =>
        prisma.wod.findMany({
          where: { userId, id: { not: wodId }, date: { gte: historyCutoff } },
          select: {
            id: true,
            date: true,
            analysis: {
              select: {
                format: true,
                durationMinutes: true,
                stimulus: true,
                movements: { select: { name: true, category: true } },
              },
            },
            result: { select: { score: true } },
            strategy: {
              select: {
                recommendedIntensity: true,
                targetRpe: true,
                criticalPoint: true,
                breakStrategy: true,
              },
            },
          },
          orderBy: { date: 'desc' },
          take: 100,
        }),
      ),
      options.basics
        ? options.basics.then((value) => value.checkins)
        : measure('context.checkins', () =>
            prisma.dailyCheckin.findMany({
              where: { userId, date: { gte: checkinCutoff } },
              orderBy: { date: 'desc' },
              select: { date: true },
            }),
          ),
      options.basics
        ? options.basics.then((value) => value.personalRecords)
        : measure('context.personalRecords', () =>
            prisma.personalRecord.findMany({
              where: { userId },
              select: {
                movementName: true,
                value: true,
                unit: true,
                recordType: true,
                repetitions: true,
                achievedAt: true,
              },
            }),
          ),
    ]);
    const historicalWods = readResult(reads[0]);
    const checkins = readResult(reads[1]);
    const personalRecords = readResult(reads[2]);

    return { historicalWods, checkins, personalRecords };
  };

  const targetRead = loadTarget();
  // Strategy enables overlap only after the atomic account-scoped lease claim.
  // GET context keeps its early target/analysis guard before reading history.
  const historyRead = options.parallelHistory
    ? loadHistory()
    : targetRead.then(() => loadHistory());
  const [targetResult, historyResult] = await Promise.allSettled([targetRead, historyRead]);
  // Finish every read, and prioritize the target error over speculative history.
  const targetWod = readResult(targetResult);
  const { historicalWods, checkins, personalRecords } = readResult(historyResult);

  const targetAnalysis: WodAnalysisSummary = {
    format: targetWod.analysis.format,
    durationMinutes: targetWod.analysis.durationMinutes,
    stimulus: targetWod.analysis.stimulus,
    movements: targetWod.analysis.movements.map((m: WodMovement) => ({
      name: m.name,
      category: m.category,
    })),
  };

  const historyEntries: HistoricalWodEntry[] = historicalWods.map((w) => ({
    wodId: w.id,
    date: w.date,
    analysis: w.analysis
      ? {
          format: w.analysis.format,
          durationMinutes: w.analysis.durationMinutes,
          stimulus: w.analysis.stimulus,
          movements: w.analysis.movements.map((m) => ({
            name: m.name,
            category: m.category,
          })),
        }
      : null,
    result: w.result ? { score: w.result.score } : null,
    previousStrategy: w.strategy
      ? {
          recommendedIntensity: w.strategy.recommendedIntensity,
          targetRpe: w.strategy.targetRpe,
          criticalPoint: w.strategy.criticalPoint,
          // Validado com Zod na criação (Fase 8) — confiável para reler aqui.
          breakStrategy: w.strategy.breakStrategy as HistoricalStrategySummary['breakStrategy'],
        }
      : null,
  }));

  const context = buildAthleteContext({
    targetAnalysis,
    historicalWods: historyEntries,
    checkins: checkins.map((c) => ({ date: c.date })),
    personalRecords: personalRecords.map((pr) => ({
      movementName: pr.movementName,
      value: pr.value,
      unit: pr.unit,
      recordType: pr.recordType,
      repetitions: pr.repetitions,
      achievedAt: pr.achievedAt,
    })),
  });

  // Strategy structure and context must refer to the same target analysis read.
  return { targetWod: { ...targetWod, analysis: targetWod.analysis }, targetAnalysis, context };
}
