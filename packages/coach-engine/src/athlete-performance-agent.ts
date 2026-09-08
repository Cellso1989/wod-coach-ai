/**
 * AthletePerformanceAgent — pergunta "como este atleta costuma responder
 * a esse tipo de estímulo?" (seção 36).
 *
 * Deliberadamente determinístico: agrega dados que já temos (histórico,
 * RPE, PRs, readiness) sem chamar a IA. Reserva-se o uso da IA para o
 * StrategyCoachAgent (Fase 8), que precisa raciocinar sobre a estratégia
 * em si — aqui só há fatos, e fatos não devem depender de um modelo que
 * pode alucinar (seção 31: manter o custo/risco da IA sob controle).
 */

export interface MovementSummary {
  name: string;
  category: string;
}

export interface WodAnalysisSummary {
  format: string | null;
  durationMinutes: number | null;
  stimulus: string | null;
  movements: MovementSummary[];
}

export interface HistoricalResultSummary {
  score: string;
  rpe: number;
}

export interface HistoricalFeedbackSummary {
  gripScore: number | null;
  legsScore: number | null;
  overallDifficulty: number | null;
  whereItBroke: string | null;
}

/**
 * Resumo da estratégia recomendada da última vez (Fase 8) para este WOD
 * histórico — a peça que fecha o Learning Loop (seção 17): comparar o
 * que foi recomendado com o que realmente aconteceu (result/feedback).
 */
export interface HistoricalStrategySummary {
  recommendedIntensity: number;
  targetRpe: number;
  criticalPoint: string | null;
  breakStrategy: Array<{ movement: string; strategy: string }>;
}

export interface HistoricalWodEntry {
  wodId: string;
  date: Date;
  analysis: WodAnalysisSummary | null;
  result: HistoricalResultSummary | null;
  feedback: HistoricalFeedbackSummary | null;
  previousStrategy: HistoricalStrategySummary | null;
}

export interface CheckinEntry {
  date: Date;
}

export interface PersonalRecordEntry {
  movementName: string;
  value: number;
  unit: string;
  achievedAt: Date;
}

export interface SimilarWodMatch {
  wodId: string;
  date: Date;
  similarityScore: number;
  analysis: WodAnalysisSummary;
  result: HistoricalResultSummary | null;
  feedback: HistoricalFeedbackSummary | null;
  previousStrategy: HistoricalStrategySummary | null;
}

export interface TrainingLoadWindow {
  days: number;
  sessionCount: number;
  averageRpe: number | null;
}

export type DataSufficiency = "low" | "moderate" | "high";

export interface AthleteContext {
  trainingLoad: {
    last7Days: TrainingLoadWindow;
    last14Days: TrainingLoadWindow;
    last28Days: TrainingLoadWindow;
  };
  similarWods: SimilarWodMatch[];
  relevantPersonalRecords: PersonalRecordEntry[];
  dataSufficiency: DataSufficiency;
}

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Similaridade 0–1 entre dois WODs, combinando formato, sobreposição de
 * movimentos, proximidade de duração e estímulo (seção 27).
 */
export function computeWodSimilarity(
  target: WodAnalysisSummary,
  candidate: WodAnalysisSummary,
): number {
  let score = 0;

  if (target.format && candidate.format && target.format === candidate.format) {
    score += 0.3;
  }

  const targetMovements = new Set(target.movements.map((m) => normalize(m.name)));
  const candidateMovements = new Set(candidate.movements.map((m) => normalize(m.name)));
  if (targetMovements.size > 0 && candidateMovements.size > 0) {
    const intersection = [...targetMovements].filter((m) => candidateMovements.has(m)).length;
    const union = new Set([...targetMovements, ...candidateMovements]).size;
    score += (intersection / union) * 0.4;
  }

  if (target.durationMinutes != null && candidate.durationMinutes != null) {
    const diff = Math.abs(target.durationMinutes - candidate.durationMinutes);
    score += Math.max(0, 1 - diff / 30) * 0.2;
  }

  if (
    target.stimulus &&
    candidate.stimulus &&
    normalize(target.stimulus) === normalize(candidate.stimulus)
  ) {
    score += 0.1;
  }

  return Math.min(1, score);
}

const MIN_SIMILARITY_SCORE = 0.3;

export function findSimilarWods(
  target: WodAnalysisSummary,
  history: HistoricalWodEntry[],
  limit = 5,
): SimilarWodMatch[] {
  return history
    .filter((entry): entry is HistoricalWodEntry & { analysis: WodAnalysisSummary } =>
      entry.analysis != null,
    )
    .map((entry) => ({
      wodId: entry.wodId,
      date: entry.date,
      similarityScore: computeWodSimilarity(target, entry.analysis),
      analysis: entry.analysis,
      result: entry.result,
      feedback: entry.feedback,
      previousStrategy: entry.previousStrategy,
    }))
    .filter((match) => match.similarityScore >= MIN_SIMILARITY_SCORE)
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, limit);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function withinLastDays(date: Date, days: number, now: Date): boolean {
  const msInDay = 24 * 60 * 60 * 1000;
  return now.getTime() - date.getTime() <= days * msInDay;
}

function trainingLoadWindow(
  days: number,
  wods: HistoricalWodEntry[],
  now: Date,
): TrainingLoadWindow {
  const wodsInWindow = wods.filter((w) => withinLastDays(w.date, days, now));

  return {
    days,
    sessionCount: wodsInWindow.length,
    averageRpe: average(
      wodsInWindow.map((w) => w.result?.rpe).filter((rpe): rpe is number => rpe != null),
    ),
  };
}

function computeDataSufficiency(
  historicalWods: HistoricalWodEntry[],
  checkins: CheckinEntry[],
): DataSufficiency {
  const wodsWithResults = historicalWods.filter((w) => w.result != null).length;

  if (wodsWithResults >= 8 && checkins.length >= 14) return "high";
  if (wodsWithResults >= 3 && checkins.length >= 5) return "moderate";
  return "low";
}

function findRelevantPersonalRecords(
  target: WodAnalysisSummary,
  personalRecords: PersonalRecordEntry[],
): PersonalRecordEntry[] {
  const targetMovements = new Set(target.movements.map((m) => normalize(m.name)));
  return personalRecords.filter((pr) => targetMovements.has(normalize(pr.movementName)));
}

export interface BuildAthleteContextInput {
  targetAnalysis: WodAnalysisSummary;
  historicalWods: HistoricalWodEntry[];
  checkins: CheckinEntry[];
  personalRecords: PersonalRecordEntry[];
  now?: Date;
}

export function buildAthleteContext(input: BuildAthleteContextInput): AthleteContext {
  const now = input.now ?? new Date();

  return {
    trainingLoad: {
      last7Days: trainingLoadWindow(7, input.historicalWods, now),
      last14Days: trainingLoadWindow(14, input.historicalWods, now),
      last28Days: trainingLoadWindow(28, input.historicalWods, now),
    },
    similarWods: findSimilarWods(input.targetAnalysis, input.historicalWods),
    relevantPersonalRecords: findRelevantPersonalRecords(
      input.targetAnalysis,
      input.personalRecords,
    ),
    dataSufficiency: computeDataSufficiency(input.historicalWods, input.checkins),
  };
}
