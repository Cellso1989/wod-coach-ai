import { describe, expect, it } from 'vitest';
import { buildMonthlyRanking, rankingMonth } from '../../apps/api/src/lib/monthly-ranking.js';
import { rankingResult, rankingUsers } from '../fixtures/monthly-ranking.js';

const rank = (results: ReturnType<typeof rankingResult>[]) =>
  buildMonthlyRanking(rankingUsers, results, '2026-10', 'b');

describe('monthly performance ranking', () => {
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

  it('averages relative performance across WODs and selects only the best attempt', () => {
    const otherA = rankingResult('a', '08:00');
    const otherB = rankingResult('b', '07:00');
    otherA.wod.rawText = otherB.wod.rawText = 'Other prescription';
    const results = [rankingResult('a', '05:00'), rankingResult('b', '06:00'), otherA, otherB];
    const before = rank(results);
    const after = rank([...results, rankingResult('a', '06:30')]);
    expect(after.athletes).toEqual(before.athletes);
    expect(after.athletes.slice(0, 2).map((athlete) => [athlete.position, athlete.points])).toEqual(
      [
        [1, 75],
        [1, 75],
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

  it.each([
    'load',
    'reps',
    'order',
    'source',
    'rounds',
    'format',
    'duration',
    'missingLoad',
    'notes',
  ])('keeps different or incomplete %s prescriptions out of a shared confrontation', (change) => {
    const different = rankingResult('b', '04:00');
    const analysis = different.wod.analysis!;
    if (change === 'load') analysis.movements[0]!.loadDescription = '30 kg';
    if (change === 'reps') analysis.movements[0]!.reps = 30;
    if (change === 'order') analysis.movements.reverse();
    if (change === 'source') different.wod.rawText = '10 rounds different workout';
    if (change === 'notes') different.wod.notes = 'Adaptei para ring rows.';
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
