import { describe, expect, it } from 'vitest';
import {
  buildDailyRanking,
  buildMonthlyRanking,
  rankingMonth,
} from '../../apps/api/src/lib/monthly-ranking.js';
import {
  calorieBikeRankingResult,
  rankingResult,
  rankingUsers,
} from '../fixtures/monthly-ranking.js';

const rank = (results: ReturnType<typeof rankingResult>[]) =>
  buildMonthlyRanking(rankingUsers, results, '2026-10', 'b');

describe('monthly performance ranking', () => {
  it.each([
    [2, [100, 25]],
    [3, [100, 63, 25]],
    [4, [100, 75, 50, 25]],
    [5, [100, 81, 63, 44, 25]],
    [6, [100, 85, 70, 55, 40, 25]],
    [7, [100, 88, 75, 63, 50, 38, 25]],
  ] as const)('awards proportional integer points with %i participants', (count, expected) => {
    const users = Array.from({ length: count }, (_, index) => ({
      id: `athlete-${index}`,
      name: `Athlete ${index}`,
    }));
    const data = buildMonthlyRanking(
      users,
      users.map((u, index) => rankingResult(u.id, `${index + 5}:00`)),
      '2026-10',
      users[0]!.id,
    );
    const ranked = data.athletes.filter((a) => a.position != null);
    expect(ranked.map((a) => a.points)).toEqual(expected);
    expect(ranked.every((a) => a.performances[0]?.athletes === count)).toBe(true);
  });

  it('recalculates all days of the month using the participant count for each day', () => {
    const days = [
      {
        day: 13,
        scores: [
          ['a', '09:39'],
          ['d', '10:05'],
        ],
      },
      {
        day: 20,
        scores: [
          ['b', '08:05'],
          ['a', '09:15'],
          ['d', '09:50'],
        ],
      },
      {
        day: 21,
        scores: [
          ['b', '09:30'],
          ['c', '10:30'],
          ['a', '11:10'],
          ['d', '11:58'],
        ],
      },
    ];
    const results = days.flatMap(({ day, scores }) =>
      scores.map(([id, score]) => {
        const result = calorieBikeRankingResult(id!, score!);
        result.createdAt = new Date(`2026-10-${day}T15:00:00Z`);
        return result;
      }),
    );
    const data = rank(results);
    expect(data.athletes.slice(0, 4).map((a) => [a.userId, a.points])).toEqual([
      ['a', 213],
      ['b', 200],
      ['c', 75],
      ['d', 75],
    ]);
  });

  it('accumulates 100 + 75 + 50 across days, counts the same WOD again on a new day and resets each month', () => {
    const results = [
      ['05:00', '06:00', '07:00', '08:00'],
      ['06:00', '05:00', '07:00', '08:00'],
      ['07:00', '05:00', '06:00', '08:00'],
    ].flatMap((scores, day) =>
      scores.map((score, index) =>
        rankingResult(['a', 'b', 'c', 'd'][index]!, score, {
          createdAt: new Date(`2026-10-${14 + day}T15:00:00Z`),
        }),
      ),
    );
    const data = buildMonthlyRanking(
      rankingUsers,
      results,
      '2026-10',
      'a',
      new Date('2026-10-16T23:00:00Z'),
    );
    const athlete = data.athletes.find((a) => a.userId === 'a')!;
    expect(athlete.points).toBe(225);
    expect(athlete.comparedWorkouts).toBe(3);
    expect(athlete.performances.map((p) => p.points)).toEqual([100, 75, 50]);
    expect(athlete.todayPerformances).toMatchObject([{ points: 50, date: '2026-10-16' }]);
    expect(new Set(athlete.performances.map((p) => p.date)).size).toBe(3);
    const tomorrow = buildMonthlyRanking(
      rankingUsers,
      results,
      '2026-10',
      'a',
      new Date('2026-10-17T23:00:00Z'),
    );
    expect(tomorrow.athletes.find((a) => a.userId === 'a')).toMatchObject({
      points: 225,
      todayPerformances: [],
    });
    const nextMonth = buildMonthlyRanking(
      rankingUsers,
      results,
      '2026-11',
      'a',
      new Date('2026-11-01T15:00:00Z'),
    );
    expect(nextMonth.athletes.every((a) => a.points == null)).toBe(true);
  });

  it('awards exactly one daily score and orders the four athletes by today WOD', () => {
    const now = new Date('2026-10-21T23:00:00Z');
    const dailyResults = ['09:30', '10:30', '11:10', '11:58'].map((score, index) => {
      const result = calorieBikeRankingResult(['a', 'b', 'c', 'd'][index]!, score);
      result.createdAt = new Date('2026-10-21T22:00:00Z');
      return result;
    });
    const oldWod = rankingResult('a', '08:05', { createdAt: new Date('2026-10-21T15:00:00Z') });
    const oldPeer = rankingResult('c', '09:15', { createdAt: new Date('2026-10-21T15:00:00Z') });
    const yesterday = rankingResult('a', '07:00', { createdAt: new Date('2026-10-20T15:00:00Z') });
    const records = [oldWod, oldPeer, yesterday, ...dailyResults];
    const data = buildDailyRanking(rankingUsers, records, 'a', now);
    expect(data.date).toBe('2026-10-21');
    expect(
      data.athletes.slice(0, 4).map((a) => [a.userId, a.position, a.points, a.comparedWorkouts]),
    ).toEqual([
      ['a', 1, 100, 1],
      ['b', 2, 75, 1],
      ['c', 3, 50, 1],
      ['d', 4, 25, 1],
    ]);
    expect(data.athletes.flatMap((a) => a.performances).map((p) => p.score)).not.toContain('08:05');
    expect(data.athletes.every((a) => a.points == null || a.points <= 100)).toBe(true);
    expect(buildDailyRanking(rankingUsers, [...records].reverse(), 'a', now)).toEqual(data);
    const month = buildMonthlyRanking(rankingUsers, records, '2026-10', 'a', now);
    expect(month.athletes.slice(0, 4).map((a) => a.points)).toEqual([100, 75, 50, 25]);
    expect(month.athletes.find((a) => a.userId === 'a')?.comparedWorkouts).toBe(1);
  });

  it('uses the best repeated attempt only for the latest valid prescription of today', () => {
    const now = new Date('2026-10-16T23:00:00Z');
    const a = calorieBikeRankingResult('a', '09:30');
    const b = calorieBikeRankingResult('b', '10:30');
    const repeat = calorieBikeRankingResult('a', '11:00');
    repeat.createdAt = new Date('2026-10-16T16:00:00Z');
    const invalid = rankingResult('a', 'invalid', { createdAt: new Date('2026-10-16T17:00:00Z') });
    const data = buildDailyRanking(rankingUsers, [a, b, repeat, invalid], 'a', now);
    expect(data.athletes[0]).toMatchObject({ points: 100, comparedWorkouts: 1 });
    expect(data.athletes[0]?.performances).toMatchObject([{ score: '09:30', points: 100 }]);
  });

  it('starts a new daily ranking at Sao Paulo midnight without carrying previous points', () => {
    const records = [rankingResult('a', '05:00'), rankingResult('b', '06:00')];
    const data = buildDailyRanking(rankingUsers, records, 'a', new Date('2026-10-17T03:00:00Z'));
    expect(data.date).toBe('2026-10-17');
    expect(data.summary.recordedResults).toBe(0);
    expect(data.athletes.every((a) => a.points == null && a.performances.length === 0)).toBe(true);
  });

  it('shows only today and ranks today attempts independently of an older monthly best', () => {
    const previous = calorieBikeRankingResult('a', '08:00');
    previous.createdAt = new Date('2026-10-15T15:00:00Z');
    const results = [
      previous,
      calorieBikeRankingResult('a', '11:10', 'Bike calories'),
      calorieBikeRankingResult('b', '09:30'),
      calorieBikeRankingResult('c', '10:30'),
      calorieBikeRankingResult('d', '11:58'),
    ];
    const data = buildMonthlyRanking(
      rankingUsers,
      results,
      '2026-10',
      'a',
      new Date('2026-10-16T15:00:00Z'),
    );
    expect(data.athletes.find((a) => a.userId === 'a')?.performances[0]?.score).toBe('11:10');
    for (const [id, position, points] of [
      ['b', 1, 100],
      ['c', 2, 75],
      ['a', 3, 50],
      ['d', 4, 25],
    ] as const) {
      expect(data.athletes.find((a) => a.userId === id)?.todayPerformances).toMatchObject([
        { position, points, athletes: 4 },
      ]);
    }
    expect(data.athletes.find((a) => a.userId === 'a')?.todayPerformances[0]?.score).toBe('11:10');
  });

  it('does not use yesterday participants to manufacture a daily comparison', () => {
    const previous = rankingResult('a', '05:00');
    previous.createdAt = new Date('2026-10-15T15:00:00Z');
    const data = buildMonthlyRanking(
      rankingUsers,
      [previous, rankingResult('b', '06:00')],
      '2026-10',
      'b',
      new Date('2026-10-16T15:00:00Z'),
    );
    expect(data.summary.rankedAthletes).toBe(0);
    expect(data.athletes.every((a) => a.todayPerformances.length === 0)).toBe(true);
  });

  it('uses Sao Paulo day boundaries and shows no daily details for an older selected month', () => {
    const a = rankingResult('a', '05:00', { createdAt: new Date('2026-10-17T02:59:00Z') });
    const b = rankingResult('b', '06:00', { createdAt: new Date('2026-10-16T03:00:00Z') });
    const c = rankingResult('c', '07:00', { createdAt: new Date('2026-10-17T03:00:00Z') });
    const data = buildMonthlyRanking(
      rankingUsers,
      [a, b, c],
      '2026-10',
      'a',
      new Date('2026-10-17T02:59:59Z'),
    );
    expect(data.athletes.find((a) => a.userId === 'a')?.todayPerformances[0]?.athletes).toBe(2);
    expect(data.athletes.find((a) => a.userId === 'c')?.todayPerformances).toEqual([]);
    const older = buildMonthlyRanking(
      rankingUsers,
      [a, b, c],
      '2026-10',
      'a',
      new Date('2026-11-01T15:00:00Z'),
    );
    expect(older.athletes.every((a) => a.todayPerformances.length === 0)).toBe(true);
  });

  it('counts the saved Bike result alongside Bike calories with matching rounds and prescription', () => {
    const results = [
      rankingResult('a', '09:39'),
      rankingResult('b', '10:05'),
      calorieBikeRankingResult('a', '11:10 min', 'Bike calories'),
      calorieBikeRankingResult('b', '11:58'),
    ];
    const original = structuredClone(results);
    results[0]!.createdAt = results[1]!.createdAt = new Date('2026-10-15T15:00:00Z');
    original[0]!.createdAt = original[1]!.createdAt = new Date('2026-10-15T15:00:00Z');
    const data = rank(results);
    expect(data.summary.comparableWorkouts).toBe(2);
    expect(data.athletes.slice(0, 2)).toMatchObject([
      { userId: 'a', points: 200, comparedWorkouts: 2 },
      { userId: 'b', points: 50, comparedWorkouts: 2 },
    ]);
    expect(data.athletes[1]?.performances).toContainEqual(
      expect.objectContaining({
        score: '11:58',
        points: 25,
        athletes: 2,
      }),
    );
    expect(results).toEqual(original);
  });

  it('normalizes calorie Bike labels in aggregate prescriptions too', () => {
    const a = calorieBikeRankingResult('a', '11:10', '  BIKE  CALORIES ');
    const b = calorieBikeRankingResult('b', '11:58');
    a.wod.analysis!.roundBreakdown = b.wod.analysis!.roundBreakdown = null;
    a.wod.analysis!.format = b.wod.analysis!.format = 'FOR_TIME';
    expect(rank([a, b]).summary.comparableWorkouts).toBe(1);
  });

  it.each(['Rower', 'Ski erg', 'Bike / Rower / Ski erg', 'Cal bike/remo/ski erg', 'Echo Bike'])(
    'keeps %s distinct from a calorie Bike',
    (name) => {
      expect(
        rank([calorieBikeRankingResult('a', '11:10', name), calorieBikeRankingResult('b', '11:58')])
          .summary.comparableWorkouts,
      ).toBe(0);
    },
  );

  it.each(['load', 'calories', 'duration', 'rounds', 'distance', 'reps', 'category'])(
    'preserves %s differences when matching Bike labels',
    (change) => {
      const a = calorieBikeRankingResult('a', '11:10', 'Bike calories');
      const b = calorieBikeRankingResult('b', '11:58');
      const analysis = b.wod.analysis!;
      const rounds = analysis.roundBreakdown as Array<{ movements: typeof analysis.movements }>;
      if (change === 'duration') analysis.durationMinutes = 14;
      if (change === 'rounds') rounds.pop();
      for (const round of rounds) {
        if (change === 'load') round.movements[0]!.loadDescription = '20 kg';
        if (change === 'calories') round.movements[2]!.calories = 15;
        if (change === 'distance') {
          round.movements[2]!.calories = null;
          round.movements[2]!.distanceMeters = 200;
        }
        if (change === 'reps') {
          round.movements[2]!.calories = null;
          round.movements[2]!.reps = 20;
        }
      }
      if (change === 'category') {
        const labeledRounds = a.wod.analysis!.roundBreakdown as typeof rounds;
        for (const round of labeledRounds) round.movements[2]!.category = 'mixed_modal';
      }
      expect(rank([a, b]).summary.comparableWorkouts).toBe(0);
    },
  );

  it('awards positive placement points to CAP and keeps users without results unclassified', () => {
    const data = rank([
      rankingResult('a', '05:00'),
      rankingResult('b', '06:00'),
      rankingResult('c', 'CAP 10'),
    ]);
    expect(
      data.athletes.map((athlete) => [athlete.userId, athlete.position, athlete.points]),
    ).toEqual([
      ['a', 1, 100],
      ['b', 2, 63],
      ['c', 3, 25],
      ['d', null, null],
      ['e', null, null],
    ]);
    expect(data.athletes[1]?.isCurrentUser).toBe(true);
    expect(data.summary.comparableWorkouts).toBe(1);
    expect(data.athletes[2]?.performances[0]).toMatchObject({ status: 'cap', remainingReps: 10 });
  });

  it('accumulates placement points across days and selects only the best attempt', () => {
    const otherA = rankingResult('a', '08:00');
    const otherB = rankingResult('b', '07:00');
    otherA.createdAt = otherB.createdAt = new Date('2026-10-17T15:00:00Z');
    otherA.wod.rawText = otherB.wod.rawText = 'Other prescription';
    otherA.wod.analysis!.movements[0]!.reps = otherB.wod.analysis!.movements[0]!.reps = 30;
    const results = [rankingResult('a', '05:00'), rankingResult('b', '06:00'), otherA, otherB];
    const before = rank(results);
    const after = rank([...results, rankingResult('a', '06:30')]);
    expect(after.athletes).toEqual(before.athletes);
    expect(after.athletes.slice(0, 2).map((athlete) => [athlete.position, athlete.points])).toEqual(
      [
        [1, 125],
        [1, 125],
      ],
    );
    expect(after.athletes[0]?.comparedWorkouts).toBe(2);
  });

  it('shares positions for equal times and orders CAP by fewer remaining reps', () => {
    const data = rank([
      rankingResult('a', '05:00'),
      rankingResult('b', '05:00'),
      rankingResult('c', 'CAP 1'),
      rankingResult('d', 'CAP 30'),
    ]);
    expect(data.athletes.slice(0, 4).map((athlete) => [athlete.position, athlete.points])).toEqual([
      [1, 100],
      [1, 100],
      [3, 50],
      [4, 25],
    ]);
  });

  it('ranks accumulated participation above one isolated win', () => {
    const secondB = rankingResult('b', '07:00');
    const secondC = rankingResult('c', '08:00');
    secondB.createdAt = secondC.createdAt = new Date('2026-10-17T15:00:00Z');
    secondB.wod.analysis!.movements[0]!.reps = 30;
    secondC.wod.analysis!.movements[0]!.reps = 30;
    const data = rank([rankingResult('a', '05:00'), rankingResult('b', '06:00'), secondB, secondC]);
    expect(data.athletes.slice(0, 3)).toMatchObject([
      { userId: 'b', position: 1, points: 125, comparedWorkouts: 2 },
      { userId: 'a', position: 2, points: 100, comparedWorkouts: 1 },
      { userId: 'c', position: 3, points: 25, comparedWorkouts: 1 },
    ]);
    expect(data.summary.comparableWorkouts).toBe(2);
  });

  it('includes every submitter in one WOD standings and recalculates when more arrive', () => {
    const initial = [rankingResult('a', '05:00'), rankingResult('b', '06:00')];
    expect(rank(initial).athletes.find((athlete) => athlete.userId === 'b')?.points).toBe(25);
    const data = rank([
      ...initial,
      rankingResult('c', '04:00'),
      rankingResult('d', '07:00'),
      rankingResult('e', '08:00'),
      rankingResult('c', '09:00'),
    ]);
    expect(data.summary).toMatchObject({ comparableWorkouts: 1, rankedAthletes: 5 });
    expect(data.athletes.map((athlete) => [athlete.userId, athlete.points])).toEqual([
      ['c', 100],
      ['a', 81],
      ['b', 63],
      ['d', 44],
      ['e', 25],
    ]);
    for (const athlete of data.athletes) {
      expect(athlete.comparedWorkouts).toBe(1);
      expect(athlete.performances[0]?.athletes).toBe(5);
    }
  });

  it('keeps the monthly total equal to the sum of displayed WOD points', () => {
    const results = [45, 30, 15].flatMap((reps) =>
      ['a', 'b', 'c'].map((userId, index) => {
        const result = rankingResult(userId, `0${index + 5}:00`);
        result.createdAt = new Date(
          `2026-10-${reps === 45 ? 14 : reps === 30 ? 15 : 16}T15:00:00Z`,
        );
        result.wod.analysis!.movements[0]!.reps = reps;
        return result;
      }),
    );
    const athlete = rank(results).athletes.find((entry) => entry.userId === 'b')!;
    expect(athlete.performances.map((performance) => performance.points)).toEqual([63, 63, 63]);
    expect(athlete.points).toBe(189);
  });

  it.each([
    'load',
    'reps',
    'order',
    'movement',
    'distance',
    'calories',
    'rounds',
    'format',
    'duration',
    'missingLoad',
  ])('keeps different or incomplete %s prescriptions out of a shared confrontation', (change) => {
    const different = rankingResult('b', '04:00');
    const analysis = different.wod.analysis!;
    if (change === 'load') analysis.movements[0]!.loadDescription = '30 kg';
    if (change === 'reps') analysis.movements[0]!.reps = 30;
    if (change === 'order') analysis.movements.reverse();
    if (change === 'movement') analysis.movements[0]!.name = 'Front squat';
    if (change === 'distance') analysis.movements[0]!.distanceMeters = 200;
    if (change === 'calories') analysis.movements[0]!.calories = 20;
    if (change === 'rounds') analysis.roundBreakdown = [{ roundNumber: 1, movements: [] }];
    if (change === 'format') analysis.format = 'AMRAP';
    if (change === 'duration') analysis.durationMinutes = 12;
    if (change === 'missingLoad') analysis.movements[0]!.loadDescription = null;
    expect(rank([rankingResult('a', '05:00'), different]).summary.rankedAthletes).toBe(0);
  });

  it('requires two distinct athletes rather than two attempts from one athlete', () => {
    expect(
      rank([rankingResult('a', '05:00'), rankingResult('a', '06:00')]).summary.rankedAthletes,
    ).toBe(0);
  });

  it('normalizes case/spacing and ignores custom WOD titles', () => {
    const b = rankingResult('b', '06:00');
    b.wod.rawText = `  ${b.wod.rawText!.toUpperCase()}  `;
    b.wod.name = 'My private title';
    expect(rank([rankingResult('a', '05:00'), b]).summary.rankedAthletes).toBe(2);
  });

  it.each(['Wod\n', 'WOD:\r\n', '  wod  \n\n'])(
    'ignores the standalone source heading %j when the prescription matches',
    (heading) => {
      const a = rankingResult('a', '9:15 min');
      const b = rankingResult('b', '9:50');
      b.wod.rawText = `${heading}${a.wod.rawText}`;
      const data = rank([a, b]);
      expect(data.summary.comparableWorkouts).toBe(1);
      expect(data.athletes.slice(0, 2).map((athlete) => [athlete.userId, athlete.points])).toEqual([
        ['a', 100],
        ['b', 25],
      ]);
    },
  );

  it('normalizes the same heading in image transcription', () => {
    const a = rankingResult('a', '9:15 min');
    const b = rankingResult('b', '9:50');
    b.wod.analysis!.rawResponse = { extractedText: `Wod\n${b.wod.rawText}` };
    b.wod.rawText = null;
    expect(rank([a, b]).summary.rankedAthletes).toBe(2);
  });

  it.each(['Treino de terça', 'WOD', null])(
    'compares the saved prescription regardless of source text %j',
    (source) => {
      const a = rankingResult('a', '9:15 min');
      const b = rankingResult('b', '9:50');
      b.wod.rawText = source;
      b.wod.notes = 'Foi difícil hoje';
      b.wod.name = 'Outro título';
      expect(rank([a, b]).summary.rankedAthletes).toBe(2);
    },
  );

  it('normalizes numeric load notation without equating different units or weights', () => {
    const a = rankingResult('a', '9:15 min');
    const b = rankingResult('b', '9:50');
    b.wod.analysis!.movements[0]!.loadDescription = '43,0KG';
    expect(rank([a, b]).summary.rankedAthletes).toBe(2);
    b.wod.analysis!.movements[0]!.loadDescription = '43 lb';
    expect(rank([a, b]).summary.rankedAthletes).toBe(0);
  });

  it('compares per-round prescriptions regardless of labels and aggregate summaries', () => {
    const a = rankingResult('a', '9:15 min');
    const b = rankingResult('b', '9:50');
    a.wod.analysis!.format = b.wod.analysis!.format = 'ROUNDS_FOR_TIME';
    const rounds = [1, 2, 3].map((roundNumber) => ({
      roundNumber,
      label: `Round ${roundNumber}`,
      movements: structuredClone(a.wod.analysis!.movements),
    }));
    a.wod.analysis!.roundBreakdown = rounds;
    b.wod.analysis!.roundBreakdown = rounds.map((round) => ({ ...round, label: 'Volta' }));
    b.wod.analysis!.movements[0]!.reps = 135;
    expect(rank([a, b]).summary.rankedAthletes).toBe(2);
    b.wod.analysis!.roundBreakdown = rounds.slice(0, 2);
    expect(rank([a, b]).summary.rankedAthletes).toBe(0);
  });

  it.each(['reps', 'load', 'order', 'missingLoad', 'number'])(
    'rejects differing or incomplete %s inside rounds even when totals match',
    (change) => {
      const a = rankingResult('a', '9:15 min');
      const b = rankingResult('b', '9:50');
      const round = { roundNumber: 1, movements: structuredClone(a.wod.analysis!.movements) };
      a.wod.analysis!.roundBreakdown = [structuredClone(round)];
      b.wod.analysis!.roundBreakdown = [round];
      if (change === 'reps') round.movements[0]!.reps = 30;
      if (change === 'load') round.movements[0]!.loadDescription = '30 kg';
      if (change === 'order') round.movements.reverse();
      if (change === 'missingLoad') round.movements[0]!.loadDescription = null;
      if (change === 'number') round.roundNumber = 2;
      expect(rank([a, b]).summary.rankedAthletes).toBe(0);
    },
  );

  it('keeps incomplete repetitions and round-based workouts without rounds unclassified', () => {
    const a = rankingResult('a', '9:15 min');
    const b = rankingResult('b', '9:50');
    a.wod.analysis!.format = b.wod.analysis!.format = 'ROUNDS_FOR_TIME';
    expect(rank([a, b]).summary.rankedAthletes).toBe(0);
    a.wod.analysis!.format = b.wod.analysis!.format = 'FOR_TIME';
    a.wod.analysis!.movements[0]!.reps = b.wod.analysis!.movements[0]!.reps = null;
    expect(rank([a, b]).summary.rankedAthletes).toBe(0);
  });

  it('recognizes pure-rep AMRAP totals and equivalent rounds/reps notation', () => {
    const results = [
      rankingResult('a', '2 rounds + 5 reps'),
      rankingResult('b', '185 reps'),
      rankingResult('c', '1 round + 1 rep'),
    ];
    for (const result of results) {
      result.wod.analysis!.format = 'AMRAP';
      result.wod.rawText = 'AMRAP 14 min: 45 thrusters 43 kg, 45 pull-ups';
    }
    const data = rank(results);
    expect(data.athletes.slice(0, 3).map((athlete) => [athlete.position, athlete.points])).toEqual([
      [1, 100],
      [1, 100],
      [3, 25],
    ]);
  });

  it('does not infer scores from ambiguous text, invalid times, mixed AMRAPs or unsupported formats', () => {
    for (const score of ['12', '12:99', 'zero', '0:00', '225 lb']) {
      expect(
        rank([rankingResult('a', '05:00'), rankingResult('b', score)]).summary.rankedAthletes,
      ).toBe(0);
    }
    const b = rankingResult('b', '2 rounds');
    b.wod.analysis!.format = 'AMRAP';
    b.wod.analysis!.movements[0]!.distanceMeters = 100;
    const a = structuredClone(b);
    a.wod.userId = 'a';
    expect(rank([a, b]).summary.rankedAthletes).toBe(0);
    a.wod.analysis!.format = b.wod.analysis!.format = 'STRENGTH';
    expect(rank([a, b]).summary.rankedAthletes).toBe(0);
  });

  it('accepts finishing exactly at the deadline and requires missing reps for an over-cap time', () => {
    const data = rank([
      rankingResult('a', '14:00'),
      rankingResult('b', 'CAP 1'),
      rankingResult('c', '14:01'),
    ]);
    expect(data.athletes.slice(0, 2).map((athlete) => athlete.points)).toEqual([100, 25]);
    expect(data.athletes.find((athlete) => athlete.userId === 'c')?.position).toBeNull();
  });

  it('gives a finisher priority over every CAP and uses the remaining rep count within CAP', () => {
    const data = rank([
      rankingResult('a', '14:00'),
      rankingResult('b', 'CAP 20'),
      rankingResult('c', 'CAP 10'),
      rankingResult('d', 'cap5 reps'),
    ]);
    expect(data.athletes.slice(0, 4).map((athlete) => [athlete.userId, athlete.points])).toEqual([
      ['a', 100],
      ['d', 75],
      ['c', 50],
      ['b', 25],
    ]);
  });

  it('gives equal points for equal remaining reps and keeps the best partial attempt', () => {
    const data = rank([
      rankingResult('a', '10:00'),
      rankingResult('b', 'CAP 10'),
      rankingResult('c', 'CAP 10 repetições'),
      rankingResult('d', 'CAP 20'),
      rankingResult('d', 'CAP 5'),
    ]);
    expect(
      data.athletes
        .slice(0, 4)
        .map((athlete) => [athlete.userId, athlete.position, athlete.points]),
    ).toEqual([
      ['a', 1, 100],
      ['d', 2, 75],
      ['c', 3, 50],
      ['b', 3, 50],
    ]);
    expect(data.athletes.find((athlete) => athlete.userId === 'd')?.comparedWorkouts).toBe(1);
  });

  it.each(['CAP', 'CAP 0', 'CAP -1', 'CAP 1.5', 'CAP 1000001', 'CAP 10 min', 'CAP 10 + 5 reps'])(
    'requires an unambiguous positive remaining rep count for %s',
    (score) => {
      expect(
        rank([rankingResult('a', '05:00'), rankingResult('b', score)]).summary.rankedAthletes,
      ).toBe(0);
    },
  );

  it('uses completed work in AMRAP rather than inventing a number of remaining reps', () => {
    const a = rankingResult('a', '2 rounds');
    const b = rankingResult('b', 'CAP 10');
    a.wod.analysis!.format = b.wod.analysis!.format = 'AMRAP';
    expect(rank([a, b]).summary.rankedAthletes).toBe(0);
  });

  it('uses São Paulo month boundaries and the original result date', () => {
    expect(rankingMonth(new Date('2026-11-01T02:59:59Z'))).toBe('2026-10');
    expect(rankingMonth(new Date('2026-11-01T03:00:00Z'))).toBe('2026-11');
    const data = rank([
      rankingResult('a', '05:00', { createdAt: new Date('2026-10-01T02:59:59Z') }),
      rankingResult('b', '06:00'),
    ]);
    expect(data.summary.recordedResults).toBe(1);
    expect(data.summary.rankedAthletes).toBe(0);
  });

  it('recalculates after editing a result', () => {
    expect(
      rank([rankingResult('a', '05:00'), rankingResult('b', '04:00')]).athletes[0]?.userId,
    ).toBe('b');
    expect(
      rank([rankingResult('a', '05:00'), rankingResult('b', 'CAP 10')]).athletes[0]?.userId,
    ).toBe('a');
  });
});
