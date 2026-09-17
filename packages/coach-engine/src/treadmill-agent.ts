/**
 * TreadmillAgent — gera protocolos de esteira determinísticos (blocos de
 * tempo com faixa de velocidade e nível de esforço), variando por nível de
 * dificuldade 1-5. Deliberadamente sem IA: é um template fixo, não há nada
 * a "raciocinar" (mesmo racional do AthletePerformanceAgent — seção 31).
 */

export type TreadmillEffort = "leve" | "moderado" | "moderado_alto" | "forte" | "maximo";

export interface TreadmillBlock {
  startMinute: number;
  endMinute: number;
  speedRange: string; // ex: "10-12" (km/h)
  effort: TreadmillEffort;
}

export interface TreadmillWorkout {
  level: number; // 1-5
  durationMinutes: number;
  blocks: TreadmillBlock[];
}

interface CycleStep {
  minutes: number;
  speedRange: string;
  effort: TreadmillEffort;
}

interface LevelConfig {
  warmupMinutes: number;
  warmupSpeedRange: string;
  cycle: CycleStep[];
  cooldownMinutes: number;
  cooldownSpeedRange: string;
}

const WARMUP_COOLDOWN_SPEED = "5-6";
const WARMUP_COOLDOWN_EFFORT: TreadmillEffort = "leve";

const LEVEL_CONFIGS: Record<number, LevelConfig> = {
  1: {
    warmupMinutes: 2,
    warmupSpeedRange: WARMUP_COOLDOWN_SPEED,
    cycle: [
      { minutes: 2, speedRange: "7-8", effort: "moderado" },
      { minutes: 1, speedRange: "9-10", effort: "moderado_alto" },
    ],
    cooldownMinutes: 2,
    cooldownSpeedRange: WARMUP_COOLDOWN_SPEED,
  },
  2: {
    warmupMinutes: 2,
    warmupSpeedRange: WARMUP_COOLDOWN_SPEED,
    cycle: [
      { minutes: 2, speedRange: "8-9", effort: "moderado" },
      { minutes: 1, speedRange: "11-12", effort: "forte" },
    ],
    cooldownMinutes: 2,
    cooldownSpeedRange: WARMUP_COOLDOWN_SPEED,
  },
  3: {
    warmupMinutes: 2,
    warmupSpeedRange: WARMUP_COOLDOWN_SPEED,
    cycle: [
      { minutes: 2, speedRange: "8-9", effort: "moderado" },
      { minutes: 2, speedRange: "10-12", effort: "moderado_alto" },
      { minutes: 1, speedRange: "13-14", effort: "forte" },
    ],
    cooldownMinutes: 2,
    cooldownSpeedRange: WARMUP_COOLDOWN_SPEED,
  },
  4: {
    warmupMinutes: 2,
    warmupSpeedRange: WARMUP_COOLDOWN_SPEED,
    cycle: [
      { minutes: 2, speedRange: "9-10", effort: "moderado" },
      { minutes: 2, speedRange: "11-13", effort: "moderado_alto" },
      { minutes: 2, speedRange: "14-16", effort: "forte" },
    ],
    cooldownMinutes: 2,
    cooldownSpeedRange: WARMUP_COOLDOWN_SPEED,
  },
  5: {
    warmupMinutes: 2,
    warmupSpeedRange: WARMUP_COOLDOWN_SPEED,
    cycle: [
      { minutes: 2, speedRange: "9-10", effort: "moderado" },
      { minutes: 2, speedRange: "11-13", effort: "moderado_alto" },
      { minutes: 2, speedRange: "14-16", effort: "forte" },
      { minutes: 2, speedRange: "17-18", effort: "maximo" },
    ],
    cooldownMinutes: 2,
    cooldownSpeedRange: WARMUP_COOLDOWN_SPEED,
  },
};

function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 3;
  const rounded = Math.round(level);
  return Math.min(5, Math.max(1, rounded));
}

function clampDuration(durationMinutes: number): number {
  if (!Number.isFinite(durationMinutes)) return 15;
  return Math.round(durationMinutes);
}

export function generateTreadmillWorkout(level: number, durationMinutes: number): TreadmillWorkout {
  const safeLevel = clampLevel(level);
  const safeDuration = Math.max(1, clampDuration(durationMinutes));
  // LEVEL_CONFIGS always has keys 1-5 and clampLevel guarantees safeLevel is
  // in that range, so this lookup can never actually be undefined.
  const config = LEVEL_CONFIGS[safeLevel] ?? LEVEL_CONFIGS[3]!;

  const middleTotal = safeDuration - config.warmupMinutes - config.cooldownMinutes;

  const blocks: TreadmillBlock[] = [];

  if (middleTotal <= 0) {
    // Duração muito curta para caber warmup + cooldown — um único bloco leve.
    blocks.push({
      startMinute: 0,
      endMinute: safeDuration,
      speedRange: WARMUP_COOLDOWN_SPEED,
      effort: WARMUP_COOLDOWN_EFFORT,
    });
    return { level: safeLevel, durationMinutes: safeDuration, blocks };
  }

  let cursor = 0;

  // Warmup
  blocks.push({
    startMinute: cursor,
    endMinute: cursor + config.warmupMinutes,
    speedRange: config.warmupSpeedRange,
    effort: WARMUP_COOLDOWN_EFFORT,
  });
  cursor += config.warmupMinutes;

  const middleEnd = cursor + middleTotal;

  // Repete o ciclo até preencher middleTotal, cortando o último bloco se
  // necessário para não ultrapassar middleEnd.
  let cycleIndex = 0;
  while (cursor < middleEnd) {
    const step = config.cycle[cycleIndex % config.cycle.length]!;
    const remaining = middleEnd - cursor;
    const blockMinutes = Math.min(step.minutes, remaining);
    blocks.push({
      startMinute: cursor,
      endMinute: cursor + blockMinutes,
      speedRange: step.speedRange,
      effort: step.effort,
    });
    cursor += blockMinutes;
    cycleIndex += 1;
  }

  // Cooldown — vai exatamente até safeDuration.
  blocks.push({
    startMinute: cursor,
    endMinute: safeDuration,
    speedRange: config.cooldownSpeedRange,
    effort: WARMUP_COOLDOWN_EFFORT,
  });

  return { level: safeLevel, durationMinutes: safeDuration, blocks };
}
