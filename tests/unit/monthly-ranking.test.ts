import { describe, expect, it } from 'vitest';
import { buildMonthlyRanking, rankingMonth } from '../../apps/api/src/lib/monthly-ranking.js';
import {
  calorieBikeRankingResult,
  rankingResult,
  rankingUsers,
} from '../fixtures/monthly-ranking.js';

const rank = (results: ReturnType<typeof rankingResult>[]) =>
  buildMonthlyRanking(rankingUsers, results, '2026-10', 'b');

describe('monthly performance ranking', () => {
  it('counts the saved Bike result alongside Bike calories with matching rounds and prescription', () => {
    const results = [
      rankingResult('a', '09:39'),
      rankingResult('b', '10:05'),
      calorieBikeRankingResult('a', '11:10 min', 'Bike calories'),
      calorieBikeRankingResult('b', '11:58'),
    ];
    const original = structuredClone(results);
    const data = rank(results);
    expect(data.summary.comparableWorkouts).toBe(2);
    expect(data.athletes.slice(0, 2)).toMatchObject([
      { userId: 'a', points: 200, comparedWorkouts: 2 },
      { userId: 'b', points: 100, comparedWorkouts: 2 },
    ]);
    expect(data.athletes[1]?.performances).toContainEqual(
      expect.objectContaining({
        score: '11:58',
        points: 50,
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
      ['b', 2, 66.67],
      ['c', 3, 33.33],
      ['d', null, null],
      ['e', null, null],
    ]);
    expect(data.athletes[1]?.isCurrentUser).toBe(true);
    expect(data.summary.comparableWorkouts).toBe(1);
    expect(data.athletes[2]?.performances[0]).toMatchObject({ status: 'cap', remainingReps: 10 });
  });

  it('accumulates placement points across WODs and selects only the best attempt', () => {
    const otherA = rankingResult('a', '08:00');
    const otherB = rankingResult('b', '07:00');
    otherA.wod.rawText = otherB.wod.rawText = 'Other prescription';
    otherA.wod.analysis!.movements[0]!.reps = otherB.wod.analysis!.movements[0]!.reps = 30;
    const results = [rankingResult('a', '05:00'), rankingResult('b', '06:00'), otherA, otherB];
    const before = rank(results);
    const after = rank([...results, rankingResult('a', '06:30')]);
    expect(after.athletes).toEqual(before.athletes);
    expect(after.athletes.slice(0, 2).map((athlete) => [athlete.position, athlete.points])).toEqual(
      [
        [1, 150],
        [1, 150],
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
    secondB.wod.analysis!.movements[0]!.reps = 30;
    secondC.wod.analysis!.movements[0]!.reps = 30;
    const data = rank([rankingResult('a', '05:00'), rankingResult('b', '06:00'), secondB, secondC]);
    expect(data.athletes.slice(0, 3)).toMatchObject([
      { userId: 'b', position: 1, points: 150, comparedWorkouts: 2 },
      { userId: 'a', position: 2, points: 100, comparedWorkouts: 1 },
      { userId: 'c', position: 3, points: 50, comparedWorkouts: 1 },
    ]);
    expect(data.summary.comparableWorkouts).toBe(2);
  });

  it('includes every submitter in one WOD standings and recalculates when more arrive', () => {
    const initial = [rankingResult('a', '05:00'), rankingResult('b', '06:00')];
    expect(rank(initial).athletes.find((athlete) => athlete.userId === 'b')?.points).toBe(50);
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
      ['a', 80],
      ['b', 60],
      ['d', 40],
      ['e', 20],
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
        result.wod.analysis!.movements[0]!.reps = reps;
        return result;
      }),
    );
    const athlete = rank(results).athletes.find((entry) => entry.userId === 'b')!;
    expect(athlete.performances.map((performance) => performance.points)).toEqual([
      66.67, 66.67, 66.67,
    ]);
    expect(athlete.points).toBe(200.01);
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
        ['b', 50],
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
      [3, 33.33],
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
    expect(data.athletes.slice(0, 2).map((athlete) => athlete.points)).toEqual([100, 50]);
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
