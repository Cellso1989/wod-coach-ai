import { createHash } from 'node:crypto';
import type { MonthlyRanking, RankedAthlete, RankingPerformance } from '@wod-coach-ai/types';

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

function workoutKey(result: RankingResult): string | null {
  const analysis = result.wod.analysis;
  if (
    !analysis ||
    !['FOR_TIME', 'ROUNDS_FOR_TIME', 'CHIPPER', 'AMRAP'].includes(analysis.format ?? '')
  )
    return null;
  const raw = analysis.rawResponse;
  const extractedText =
    raw &&
    typeof raw === 'object' &&
    'extractedText' in raw &&
    typeof raw.extractedText === 'string'
      ? raw.extractedText
      : null;
  const source = result.wod.rawText?.trim() || extractedText?.trim();
  if (!source || !analysis.movements.length) return null;
  // Do not group athletes by a name or profile level: compare the registered prescription.
  if (
    analysis.movements.some(
      (movement) => movement.category === 'weightlifting' && !movement.loadDescription?.trim(),
    )
  )
    return null;
  const prescription = {
    source,
    notes: result.wod.notes?.trim() || null,
    format: analysis.format,
    durationMinutes: analysis.durationMinutes,
    movements: analysis.movements,
    rounds: analysis.roundBreakdown,
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
    if (entry.comparedWorkouts)
      entry.points =
        Math.round(
          (entry.performances.reduce((sum, item) => sum + item.points, 0) /
            entry.comparedWorkouts) *
            100,
        ) / 100;
    entry.performances = entry.performances.map((item) => ({
      ...item,
      points: Math.round(item.points * 100) / 100,
    }));
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
