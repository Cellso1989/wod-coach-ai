import { createHash } from 'node:crypto';
import type { MonthlyRanking, RankedAthlete, RankingPerformance } from '@wod-coach-ai/types';
import { wodRoundOutputSchema, type WodMovementOutput } from '@wod-coach-ai/validation';

interface RankingMovement {
  name: string;
  category: string;
  reps: number | null;
  distanceMeters: number | null;
  calories: number | null;
  loadDescription: string | null;
}

export interface RankingResult {
  id: string;
  score: string;
  createdAt: Date;
  wod: {
    userId: string;
    name: string | null;
    rawText: string | null;
    notes?: string | null;
    analysis: {
      format: string | null;
      durationMinutes: number | null;
      movements: RankingMovement[];
      roundBreakdown: unknown;
      rawResponse: unknown;
    } | null;
  };
}

const monthFormatter = new Intl.DateTimeFormat('en', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
});

export function rankingMonth(date: Date): string {
  const parts = monthFormatter.formatToParts(date);
  return `${parts.find((part) => part.type === 'year')!.value}-${parts.find((part) => part.type === 'month')!.value}`;
}

function normalize(text: string): string {
  return text.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}

function canonical(value: unknown): unknown {
  if (typeof value === 'string') return normalize(value);
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

function prescribedMovement(movement: Omit<WodMovementOutput, 'category'> & { category: string }) {
  const load = movement.loadDescription?.trim();
  if (!movement.name.trim() || (movement.category === 'weightlifting' && !load)) return null;
  const volume = [movement.reps, movement.distanceMeters, movement.calories];
  if (
    !volume.some((value) => value != null && value > 0) ||
    volume.some((value) => value != null && (!Number.isFinite(value) || value < 0))
  )
    return null;
  const normalizedLoad = load ? normalize(load) : null;
  const numericLoad = normalizedLoad?.match(/^(\d+(?:[.,]\d+)?)\s*(kg|lb|lbs)$/);
  return {
    name: normalize(movement.name).replace(/-/g, ' '),
    reps: movement.reps ?? null,
    distanceMeters: movement.distanceMeters ?? null,
    calories: movement.calories ?? null,
    load: numericLoad
      ? `${Number(numericLoad[1]!.replace(',', '.'))} ${numericLoad[2] === 'lbs' ? 'lb' : numericLoad[2]}`
      : normalizedLoad,
  };
}

function workoutKey(result: RankingResult): string | null {
  const analysis = result.wod.analysis;
  if (
    !analysis ||
    !['FOR_TIME', 'ROUNDS_FOR_TIME', 'CHIPPER', 'AMRAP'].includes(analysis.format ?? '')
  )
    return null;
  // Compare the saved execution prescription, not the athlete's prose or AI labels.
  // Explicit rounds carry per-round volume; aggregate totals cannot replace them.
  let rounds = null;
  if (analysis.roundBreakdown != null) {
    const parsed = wodRoundOutputSchema.array().min(1).safeParse(analysis.roundBreakdown);
    if (!parsed.success) return null;
    if (parsed.data.some((round, index) => round.roundNumber !== index + 1)) return null;
    rounds = parsed.data.map((round) => round.movements.map(prescribedMovement));
    if (rounds.some((movements) => movements.some((movement) => movement == null))) return null;
  } else if (analysis.format === 'ROUNDS_FOR_TIME') {
    return null;
  }
  const movements = rounds ? null : analysis.movements.map(prescribedMovement);
  if (movements && (!movements.length || movements.some((movement) => movement == null)))
    return null;
  const prescription = {
    format: analysis.format,
    durationMinutes: analysis.durationMinutes,
    movements,
    rounds,
  };
  return createHash('sha256')
    .update(JSON.stringify(canonical(prescription)))
    .digest('hex');
}

interface ParsedScore {
  status: 'finished' | 'cap';
  values: number[];
  remainingReps?: number;
}

function parseScore(result: RankingResult): ParsedScore | null {
  const score = normalize(result.score);
  const analysis = result.wod.analysis!;
  const cap = score.match(/^cap\s*(\d+)\s*(?:reps?|repetições|repeticoes)?$/);
  if (cap) {
    const remainingReps = Number(cap[1]);
    // AMRAP has no prescribed finishing rep total; use its completed rounds/reps instead.
    if (
      analysis.format === 'AMRAP' ||
      !Number.isSafeInteger(remainingReps) ||
      remainingReps < 1 ||
      remainingReps > 1000000
    )
      return null;
    return { status: 'cap', values: [-remainingReps], remainingReps };
  }
  if (analysis.format === 'AMRAP') {
    if (!analysis.durationMinutes || analysis.roundBreakdown != null) return null;
    const rounds = score.match(/^(\d+)\s*(?:rounds?|rondas?|voltas?)(?:\s*\+\s*(\d+)\s*reps?)?$/);
    const reps = score.match(/^(\d+)\s*reps?$/);
    const repsPerRound = analysis.movements.every(
      (movement) =>
        movement.reps != null &&
        movement.reps > 0 &&
        movement.distanceMeters == null &&
        movement.calories == null,
    )
      ? analysis.movements.reduce((sum, movement) => sum + movement.reps!, 0)
      : null;
    // Mixed distances/calories have no common rep total; keep unsupported scores unranked.
    if (!repsPerRound) return null;
    if (rounds) {
      const extra = Number(rounds[2] ?? 0);
      const total = Number(rounds[1]) * repsPerRound + extra;
      if (extra >= repsPerRound || !Number.isSafeInteger(total) || total > 1000000) return null;
      return { status: 'finished', values: [total] };
    }
    const total = reps ? Number(reps[1]) : null;
    return total != null && Number.isSafeInteger(total) && total <= 1000000
      ? { status: 'finished', values: [total] }
      : null;
  }
  const clock = score.match(/^(\d+):([0-5]\d)(?:\s*(?:min|mins|minutos?))?$/);
  const minutes = score.match(/^(\d+(?:[.,]\d+)?)\s*(?:min|mins|minutos?)$/);
  const seconds = clock
    ? Number(clock[1]) * 60 + Number(clock[2])
    : minutes
      ? Number(minutes[1]!.replace(',', '.')) * 60
      : null;
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0 || seconds > 36000) return null;
  if (analysis.durationMinutes != null && seconds > analysis.durationMinutes * 60) return null;
  return { status: 'finished', values: [-seconds] };
}

function compare(a: ParsedScore, b: ParsedScore): number {
  if (a.status !== b.status) return a.status === 'finished' ? -1 : 1;
  return (b.values[0] ?? 0) - (a.values[0] ?? 0);
}

export function buildMonthlyRanking(
  users: Array<{ id: string; name: string }>,
  results: RankingResult[],
  month: string,
  currentUserId: string,
): MonthlyRanking {
  const entries = new Map<string, RankedAthlete>(
    users.map((user) => [
      user.id,
      {
        userId: user.id,
        name: user.name,
        position: null,
        points: null,
        comparedWorkouts: 0,
        isCurrentUser: user.id === currentUserId,
        performances: [],
      },
    ]),
  );
  const groups = new Map<string, Array<{ result: RankingResult; parsed: ParsedScore }>>();
  const monthlyResults = results.filter(
    (result) => rankingMonth(result.createdAt) === month && entries.has(result.wod.userId),
  );
  for (const result of monthlyResults) {
    const key = workoutKey(result);
    if (!key) continue;
    const parsed = parseScore(result);
    if (!parsed) continue;
    const group = groups.get(key) ?? [];
    group.push({ result, parsed });
    groups.set(key, group);
  }

  let comparableWorkouts = 0;
  let includedResults = 0;
  for (const group of groups.values()) {
    const best = new Map<string, (typeof group)[number]>();
    for (const attempt of group) {
      const previous = best.get(attempt.result.wod.userId);
      if (!previous || compare(attempt.parsed, previous.parsed) < 0)
        best.set(attempt.result.wod.userId, attempt);
    }
    if (best.size < 2) continue;
    // One shared standings table includes every eligible athlete for this prescription.
    const sorted = [...best.values()].sort((a, b) => compare(a.parsed, b.parsed));
    comparableWorkouts++;
    includedResults += best.size;
    let position = 1;
    sorted.forEach((attempt, index) => {
      if (index > 0 && compare(attempt.parsed, sorted[index - 1]!.parsed) !== 0)
        position = index + 1;
      const performance: RankingPerformance = {
        workout: sorted[0]!.result.wod.name?.trim() || 'WOD do mês',
        score: attempt.result.score,
        position,
        athletes: best.size,
        points: (100 * (best.size - position + 1)) / best.size,
        status: attempt.parsed.status,
        remainingReps: attempt.parsed.remainingReps ?? null,
      };
      entries.get(attempt.result.wod.userId)!.performances.push(performance);
    });
  }
  for (const entry of entries.values()) {
    entry.comparedWorkouts = entry.performances.length;
    entry.performances = entry.performances.map((item) => ({
      ...item,
      points: Math.round(item.points * 100) / 100,
    }));
    if (entry.comparedWorkouts)
      entry.points =
        Math.round(entry.performances.reduce((sum, item) => sum + item.points, 0) * 100) / 100;
  }
  const athletes = [...entries.values()].sort(
    (a, b) =>
      (b.points ?? -1) - (a.points ?? -1) ||
      a.name.localeCompare(b.name, 'pt-BR') ||
      a.userId.localeCompare(b.userId),
  );
  let position = 1;
  athletes.forEach((athlete, index) => {
    if (athlete.points == null) return;
    if (index > 0 && athlete.points !== athletes[index - 1]!.points) position = index + 1;
    athlete.position = position;
  });
  return {
    month,
    summary: {
      users: users.length,
      rankedAthletes: athletes.filter((athlete) => athlete.position != null).length,
      comparableWorkouts,
      recordedResults: monthlyResults.length,
      uncomparedResults: monthlyResults.length - includedResults,
    },
    athletes,
  };
}
