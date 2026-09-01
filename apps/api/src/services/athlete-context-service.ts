import { prisma } from "@wod-coach-ai/database";
import {
  buildAthleteContext,
  type AthleteContext,
  type HistoricalStrategySummary,
  type HistoricalWodEntry,
  type WodAnalysisSummary,
} from "@wod-coach-ai/coach-engine";

const HISTORY_WINDOW_DAYS = 90;
const CHECKIN_WINDOW_DAYS = 28;

export class WodNotFoundError extends Error {}
export class WodNotAnalyzedError extends Error {}

/**
 * Loads the target WOD (with its analysis) plus the athlete's recent
 * history, and assembles the AthleteContext (Fase 7). Shared between
 * GET /wods/:id/context and the StrategyCoachAgent route (Fase 8) so
 * the same data-fetching isn't duplicated across routes.
 */
export async function getAthleteContextForWod(
  userId: string,
  wodId: string,
): Promise<{ targetAnalysis: WodAnalysisSummary; context: AthleteContext }> {
  const targetWod = await prisma.wod.findFirst({
    where: { id: wodId, userId },
    include: { analysis: { include: { movements: true } } },
  });

  if (!targetWod) {
    throw new WodNotFoundError();
  }
  if (!targetWod.analysis) {
    throw new WodNotAnalyzedError();
  }

  const historyCutoff = new Date(Date.now() - HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const checkinCutoff = new Date(Date.now() - CHECKIN_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [historicalWods, checkins, personalRecords] = await Promise.all([
    prisma.wod.findMany({
      where: { userId, id: { not: wodId }, date: { gte: historyCutoff } },
      include: {
        analysis: { include: { movements: true } },
        result: { include: { feedback: true } },
        strategy: true,
      },
      orderBy: { date: "desc" },
      take: 100,
    }),
    prisma.dailyCheckin.findMany({
      where: { userId, date: { gte: checkinCutoff } },
      orderBy: { date: "desc" },
    }),
    prisma.personalRecord.findMany({ where: { userId } }),
  ]);

  const targetAnalysis: WodAnalysisSummary = {
    format: targetWod.analysis.format,
    durationMinutes: targetWod.analysis.durationMinutes,
    stimulus: targetWod.analysis.stimulus,
    movements: targetWod.analysis.movements.map((m) => ({ name: m.name, category: m.category })),
  };

  const historyEntries: HistoricalWodEntry[] = historicalWods.map((w) => ({
    wodId: w.id,
    date: w.date,
    analysis: w.analysis
      ? {
          format: w.analysis.format,
          durationMinutes: w.analysis.durationMinutes,
          stimulus: w.analysis.stimulus,
          movements: w.analysis.movements.map((m) => ({ name: m.name, category: m.category })),
        }
      : null,
    result: w.result ? { score: w.result.score, rpe: w.result.rpe } : null,
    feedback: w.result?.feedback
      ? {
          gripScore: w.result.feedback.gripScore,
          legsScore: w.result.feedback.legsScore,
          overallDifficulty: w.result.feedback.overallDifficulty,
          whereItBroke: w.result.feedback.whereItBroke,
        }
      : null,
    previousStrategy: w.strategy
      ? {
          recommendedIntensity: w.strategy.recommendedIntensity,
          targetRpe: w.strategy.targetRpe,
          criticalPoint: w.strategy.criticalPoint,
          // Validado com Zod na criação (Fase 8) — confiável para reler aqui.
          breakStrategy: w.strategy.breakStrategy as HistoricalStrategySummary["breakStrategy"],
        }
      : null,
  }));

  const context = buildAthleteContext({
    targetAnalysis,
    historicalWods: historyEntries,
    checkins: checkins.map((c) => ({ date: c.date, readinessScore: c.readinessScore })),
    personalRecords: personalRecords.map((pr) => ({
      movementName: pr.movementName,
      value: pr.value,
      unit: pr.unit,
      achievedAt: pr.achievedAt,
    })),
  });

  return { targetAnalysis, context };
}
