import type {
  DailyRanking,
  MonthlyRanking,
  RankedAthlete,
  RankingPerformance,
} from '@wod-coach-ai/types';
export interface RankingResult {
  id: string;
  score: string;
  createdAt: Date;
  wod: { userId: string };
}

// First scoring day of the new ranking. Preserve earlier results as history.
export const RANKING_SCORING_START = '2026-10-26';

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

interface ParsedScore {
  kind: 'time' | 'rounds' | 'reps';
  status: 'finished' | 'cap';
  values: number[];
  remainingReps?: number;
}

// Ranking depends exclusively on the submitted score, never the workout analysis.
function parseScore(result: RankingResult): ParsedScore | null {
  const score = normalize(result.score);
  const cap = score.match(/^cap\s*(\d+)\s*(?:reps?|repetições|repeticoes)?$/);
  if (cap) {
    const remainingReps = Number(cap[1]);
    if (!Number.isSafeInteger(remainingReps) || remainingReps < 1 || remainingReps > 1000000)
      return null;
    return { kind: 'time', status: 'cap', values: [-remainingReps], remainingReps };
  }
  const rounds = score.match(/^(\d+)\s*(?:rounds?|rondas?|voltas?)(?:\s*\+\s*(\d+)\s*reps?)?$/);
  if (rounds) {
    const values = [Number(rounds[1]), Number(rounds[2] ?? 0)];
    if (values.some((value) => !Number.isSafeInteger(value) || value > 1000000)) return null;
    return { kind: 'rounds', status: 'finished', values };
  }
  const reps = score.match(/^(\d+)\s*reps?$/);
  if (reps) {
    const total = Number(reps[1]);
    if (!Number.isSafeInteger(total) || total > 1000000) return null;
    return { kind: 'reps', status: 'finished', values: [total] };
  }
  const clock = score.match(/^(\d+):([0-5]\d)(?:\s*(?:min|mins|minutos?))?$/);
  const minutes = score.match(/^(\d+(?:[.,]\d+)?)\s*(?:min|mins|minutos?)$/);
  const seconds = clock
    ? Number(clock[1]) * 60 + Number(clock[2])
    : minutes
      ? Number(minutes[1]!.replace(',', '.')) * 60
      : null;
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0 || seconds > 36000) return null;
  return { kind: 'time', status: 'finished', values: [-seconds] };
}

function compare(a: ParsedScore, b: ParsedScore): number {
  if (a.status !== b.status) return a.status === 'finished' ? -1 : 1;
  for (let index = 0; index < Math.max(a.values.length, b.values.length); index++) {
    const difference = (b.values[index] ?? 0) - (a.values[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

const resultLabels = {
  time: 'Tempo / CAP',
  rounds: 'Rounds + reps',
  reps: 'Repetições',
};

const dayFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function rankingWeekStart(now: Date): string {
  const date = new Date(`${dayFormatter.format(now)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function attachWeekResults(athletes: RankedAthlete[], results: RankingResult[], now: Date) {
  const start = rankingWeekStart(now);
  const today = dayFormatter.format(now);
  const entries = new Map(athletes.map((athlete) => [athlete.userId, athlete]));
  const scored = new Map<string, RankingPerformance>();
  const week = results.filter((result) => {
    const date = dayFormatter.format(result.createdAt);
    return date >= start && date <= today;
  });
  const dates = new Set(week.map((result) => dayFormatter.format(result.createdAt)));
  const users = athletes.map((athlete) => ({ id: athlete.userId, name: athlete.name }));
  for (const date of dates) {
    const day = buildDailyRanking(users, week, '', new Date(`${date}T12:00:00Z`));
    for (const athlete of day.athletes)
      for (const performance of athlete.performances) scored.set(performance.resultId, performance);
  }
  for (const result of [...results].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id),
  )) {
    const date = dayFormatter.format(result.createdAt);
    if (date < start || date > today) continue;
    const performance = scored.get(result.id);
    entries.get(result.wod.userId)?.weekResults.push({
      id: result.id,
      date,
      score: result.score,
      position: performance?.position ?? null,
      points: performance?.points ?? null,
      beforeScoringStart: date < RANKING_SCORING_START,
    });
  }
}

export function buildDailyRanking(
  users: Array<{ id: string; name: string }>,
  results: RankingResult[],
  currentUserId: string,
  now = new Date(),
): DailyRanking {
  const date = dayFormatter.format(now);
  const eligible = new Set(users.map((user) => user.id));
  const today = results.filter(
    (result) =>
      date >= RANKING_SCORING_START &&
      dayFormatter.format(result.createdAt) === date &&
      eligible.has(result.wod.userId),
  );
  // One result type per athlete/day, selected by the latest valid submission.
  // Repeated submissions of that type use the best result, never extra points.
  const keyed = today
    .map((result) => ({ result, key: parseScore(result)?.kind }))
    .filter((item) => item.key != null)
    .sort(
      (a, b) =>
        b.result.createdAt.getTime() - a.result.createdAt.getTime() ||
        b.result.id.localeCompare(a.result.id),
    );
  const active = new Map<string, string>();
  for (const { result, key } of keyed) {
    if (!active.has(result.wod.userId)) active.set(result.wod.userId, key!);
  }
  const ranking = buildResultRanking(
    users,
    keyed
      .filter(({ result, key }) => active.get(result.wod.userId) === key)
      .map((item) => item.result),
    currentUserId,
  );
  ranking.summary.recordedResults = today.length;
  ranking.summary.uncomparedResults =
    today.length - ranking.athletes.reduce((sum, a) => sum + a.performances.length, 0);
  for (const athlete of ranking.athletes) athlete.todayPerformances = athlete.performances;
  return { date, ...ranking };
}

export function buildMonthlyRanking(
  users: Array<{ id: string; name: string }>,
  results: RankingResult[],
  month: string,
  currentUserId: string,
  now = new Date(),
): MonthlyRanking {
  const monthlyResults = results.filter(
    (result) =>
      rankingMonth(result.createdAt) === month &&
      dayFormatter.format(result.createdAt) >= RANKING_SCORING_START,
  );
  const monthly = buildResultRanking(users, [], currentUserId);
  const entries = new Map(monthly.athletes.map((athlete) => [athlete.userId, athlete]));
  const byDay = new Map<string, RankingResult[]>();
  for (const result of monthlyResults) {
    const date = dayFormatter.format(result.createdAt);
    const day = byDay.get(date) ?? [];
    day.push(result);
    byDay.set(date, day);
  }
  const today = dayFormatter.format(now);
  for (const [date, records] of [...byDay].sort(([a], [b]) => a.localeCompare(b))) {
    const day = buildDailyRanking(users, records, currentUserId, new Date(`${date}T12:00:00Z`));
    monthly.summary.comparableWorkouts += day.summary.comparableWorkouts;
    monthly.summary.recordedResults += day.summary.recordedResults;
    monthly.summary.uncomparedResults += day.summary.uncomparedResults;
    for (const athlete of day.athletes) {
      const entry = entries.get(athlete.userId)!;
      entry.performances.push(...athlete.performances);
      if (date === today) entry.todayPerformances = athlete.performances;
    }
  }
  for (const athlete of monthly.athletes) {
    athlete.comparedWorkouts = athlete.performances.length;
    athlete.points = athlete.comparedWorkouts
      ? athlete.performances.reduce((sum, p) => sum + p.points, 0)
      : null;
  }
  sortAndPosition(monthly.athletes);
  monthly.summary.rankedAthletes = monthly.athletes.filter((a) => a.position != null).length;
  attachWeekResults(monthly.athletes, results, now);
  return { month, ...monthly };
}

function buildResultRanking(
  users: Array<{ id: string; name: string }>,
  results: RankingResult[],
  currentUserId: string,
): Omit<MonthlyRanking, 'month'> {
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
        todayPerformances: [],
        weekResults: [],
      },
    ]),
  );
  const groups = new Map<string, Array<{ result: RankingResult; parsed: ParsedScore }>>();
  const monthlyResults = results.filter((result) => entries.has(result.wod.userId));
  for (const result of monthlyResults) {
    const parsed = parseScore(result);
    if (!parsed) continue;
    const key = parsed.kind;
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
    // Compare the same score unit regardless of which workout was performed.
    const sorted = [...best.values()].sort((a, b) => compare(a.parsed, b.parsed));
    comparableWorkouts++;
    includedResults += best.size;
    let position = 1;
    sorted.forEach((attempt, index) => {
      if (index > 0 && compare(attempt.parsed, sorted[index - 1]!.parsed) !== 0)
        position = index + 1;
      const performance: RankingPerformance = {
        resultId: attempt.result.id,
        date: dayFormatter.format(attempt.result.createdAt),
        workout: resultLabels[attempt.parsed.kind],
        score: attempt.result.score,
        position,
        athletes: best.size,
        points: [100, 75, 50, 25][position - 1] ?? 10,
        status: attempt.parsed.status,
        remainingReps: attempt.parsed.remainingReps ?? null,
      };
      entries.get(attempt.result.wod.userId)!.performances.push(performance);
    });
  }
  for (const entry of entries.values()) {
    entry.comparedWorkouts = entry.performances.length;
    if (entry.comparedWorkouts)
      entry.points = entry.performances.reduce((sum, item) => sum + item.points, 0);
  }
  const athletes = [...entries.values()];
  sortAndPosition(athletes);
  return {
    scoringStartsOn: RANKING_SCORING_START,
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

function sortAndPosition(athletes: RankedAthlete[]) {
  athletes.sort(
    (a, b) =>
      (b.points ?? -1) - (a.points ?? -1) ||
      a.name.localeCompare(b.name, 'pt-BR') ||
      a.userId.localeCompare(b.userId),
  );
  let position = 1;
  athletes.forEach((athlete, index) => {
    if (athlete.points == null) {
      athlete.position = null;
      return;
    }
    if (index > 0 && athlete.points !== athletes[index - 1]!.points) position = index + 1;
    athlete.position = position;
  });
}
