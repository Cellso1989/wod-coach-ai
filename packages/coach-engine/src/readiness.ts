/**
 * Deterministic Readiness Score.
 *
 * Per seção 8/28 of the product spec: this score is a rule-based
 * calculation, never decided by the AI. The AI (StrategyCoachAgent,
 * Fase 8) consumes this score as an input signal, it does not compute it.
 */

export interface DailyCheckinInput {
  /** 1 (pior) a 10 (melhor) */
  sleep: number;
  /** 1 (pior) a 10 (melhor) */
  energy: number;
  /** 1 (menos estresse) a 10 (mais estresse) */
  stress: number;
  /** 1 (sem dor) a 10 (dor extrema) */
  muscleSoreness: number;
  /** 1 (sem dor) a 10 (dor extrema) */
  jointPain: number;
  /** 1 (pior) a 10 (melhor) */
  motivation: number;
}

export type ReadinessBand = "low" | "moderate" | "high";

export interface ReadinessResult {
  /** 0–100 */
  score: number;
  band: ReadinessBand;
  /** Sinalizações de cautela — nunca diagnósticos (seção 28). */
  cautionFlags: string[];
}

const WEIGHTS = {
  sleep: 0.25,
  energy: 0.2,
  stress: 0.15,
  muscleSoreness: 0.15,
  jointPain: 0.15,
  motivation: 0.1,
} as const;

const METRIC_MIN = 1;
const METRIC_MAX = 10;

function invert(value: number): number {
  return METRIC_MAX + METRIC_MIN - value;
}

function clampMetric(value: number): number {
  return Math.min(METRIC_MAX, Math.max(METRIC_MIN, value));
}

export function calculateReadinessScore(input: DailyCheckinInput): ReadinessResult {
  const sleep = clampMetric(input.sleep);
  const energy = clampMetric(input.energy);
  const stress = clampMetric(input.stress);
  const muscleSoreness = clampMetric(input.muscleSoreness);
  const jointPain = clampMetric(input.jointPain);
  const motivation = clampMetric(input.motivation);

  const weighted =
    sleep * WEIGHTS.sleep +
    energy * WEIGHTS.energy +
    invert(stress) * WEIGHTS.stress +
    invert(muscleSoreness) * WEIGHTS.muscleSoreness +
    invert(jointPain) * WEIGHTS.jointPain +
    motivation * WEIGHTS.motivation;

  // weighted is on a 1–10 scale; convert to 0–100.
  const score = Math.round(((weighted - METRIC_MIN) / (METRIC_MAX - METRIC_MIN)) * 100);

  const band: ReadinessBand = score >= 70 ? "high" : score >= 45 ? "moderate" : "low";

  const cautionFlags: string[] = [];
  if (jointPain >= 7) {
    cautionFlags.push(
      "Dor articular elevada — considere reduzir carga/impacto e priorizar mobilidade. Não é um diagnóstico; procure avaliação profissional se a dor persistir.",
    );
  }
  if (muscleSoreness >= 9) {
    cautionFlags.push("Dor muscular muito alta — recuperação pode estar comprometida.");
  }
  if (sleep <= 3) {
    cautionFlags.push("Sono muito baixo — risco maior de queda de performance e lesão.");
  }
  if (stress >= 9) {
    cautionFlags.push("Nível de estresse muito alto.");
  }

  return { score, band, cautionFlags };
}
