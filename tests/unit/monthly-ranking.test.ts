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
  buildMonthlyRanking(rankingUsers, results, '2026-11', 'b');

describe('monthly performance ranking', () => {
  it('starts scoring at Sao Paulo midnight on October 26 and keeps earlier records intact', () => {
    const records = [
      rankingResult('a', '01:00', { id: 'old-a', createdAt: new Date('2026-10-26T02:59:59Z') }),
      rankingResult('b', '02:00', { id: 'old-b', createdAt: new Date('2026-10-26T02:59:59Z') }),
      rankingResult('a', '11:36', { id: 'today-a', createdAt: new Date('2026-10-26T03:00:00Z') }),
      rankingResult('b', '12:30', { id: 'today-b', createdAt: new Date('2026-10-26T03:00:00Z') }),
    ];
    const original = structuredClone(records);
    const data = buildMonthlyRanking(
      rankingUsers,
      records,
      '2026-10',
      'a',
      new Date('2026-10-26T23:00:00Z'),
    );
    expect(data.scoringStartsOn).toBe('2026-10-26');
    expect(data.athletes.slice(0, 2)).toMatchObject([
      { userId: 'a', points: 100, comparedWorkouts: 1 },
      { userId: 'b', points: 75, comparedWorkouts: 1 },
    ]);
    expect(data.summary).toMatchObject({ recordedResults: 2, comparableWorkouts: 1 });
    expect(
      buildDailyRanking(
        rankingUsers,
        records,
        'a',
        new Date('2026-10-26T02:59:59Z'),
      ).athletes.every((a) => a.points == null),
    ).toBe(true);
    expect(data.athletes[0]!.weekResults.map((r) => r.id)).toEqual(['today-a']);
    expect(records).toEqual(original);
  });

  it('includes every weekly submission, including duplicates, invalid scores and results without peers', () => {
    const record = (id: string, userId: string, score: string, date: string) =>
      rankingResult(userId, score, { id, createdAt: new Date(date) });
    const records = [
      record('sunday', 'a', '01:00', '2026-10-26T02:59:59Z'),
      record('best', 'a', '05:00', '2026-10-26T03:00:00Z'),
      record('peer', 'b', '06:00', '2026-10-26T12:00:00Z'),
      record('repeat', 'a', '07:00', '2026-10-26T14:00:00Z'),
      record('alone', 'a', '10 rounds', '2026-10-27T12:00:00Z'),
      record('invalid', 'a', 'resultado livre', '2026-10-28T12:00:00Z'),
      record('outsider', 'not-opted-in', '05:00', '2026-10-28T12:00:00Z'),
      record('future', 'a', '02:00', '2026-10-30T12:00:00Z'),
      record('next-week', 'a', '03:00', '2026-11-02T12:00:00Z'),
    ];
    const data = buildMonthlyRanking(
      rankingUsers,
      records,
      '2026-10',
      'a',
      new Date('2026-10-29T12:00:00Z'),
    );
    const week = data.athletes.find((a) => a.userId === 'a')!.weekResults;
    expect(week.map((r) => [r.id, r.points])).toEqual([
      ['invalid', null],
      ['alone', null],
      ['repeat', null],
      ['best', 100],
    ]);
    expect(week[3]).toMatchObject({ date: '2026-10-26', score: '05:00', position: 1 });
    expect(data.athletes.flatMap((a) => a.weekResults).some((r) => r.id === 'outsider')).toBe(
      false,
    );
    expect(
      buildMonthlyRanking(
        rankingUsers,
        [...records].reverse(),
        '2026-10',
        'a',
        new Date('2026-10-29T12:00:00Z'),
      ),
    ).toEqual(data);
  });

  it('shows the full current week across a month boundary without adding previous-month points', () => {
    const records = ['2026-10-26', '2026-11-01'].flatMap((date) => [
      rankingResult('a', '05:00', { id: `${date}-a`, createdAt: new Date(`${date}T12:00:00Z`) }),
      rankingResult('b', '06:00', { id: `${date}-b`, createdAt: new Date(`${date}T12:00:00Z`) }),
    ]);
    const data = buildMonthlyRanking(
      rankingUsers,
      records,
      '2026-11',
      'a',
      new Date('2026-11-02T02:59:59Z'),
    );
    expect(data.athletes[0]).toMatchObject({ points: 100, comparedWorkouts: 1 });
    expect(data.athletes[0]!.weekResults.map((r) => [r.date, r.points])).toEqual([
      ['2026-11-01', 100],
      ['2026-10-26', 100],
    ]);
    const monday = buildMonthlyRanking(
      rankingUsers,
      records,
      '2026-11',
      'a',
      new Date('2026-11-02T03:00:00Z'),
    );
    expect(monday.athletes.every((a) => a.weekResults.length === 0)).toBe(true);
    expect(monday.athletes[0]!.points).toBe(100);
  });

  it('keeps pre-reset history visible without allowing it to score, even after editing', () => {
    const records = [
      rankingResult('a', '05:00', { id: 'old-a', createdAt: new Date('2026-10-23T12:00:00Z') }),
      rankingResult('b', '06:00', { id: 'old-b', createdAt: new Date('2026-10-23T12:00:00Z') }),
    ];
    records[0]!.score = '04:00';
    const data = buildMonthlyRanking(
      rankingUsers,
      records,
      '2026-10',
      'a',
      new Date('2026-10-25T12:00:00Z'),
    );
    expect(data.athletes.every((a) => a.points == null)).toBe(true);
    expect(data.athletes.find((a) => a.userId === 'a')!.weekResults).toMatchObject([
      { id: 'old-a', score: '04:00', points: null, beforeScoringStart: true },
    ]);
  });

  it('ranks minimal records without fetching any workout details or analysis', () => {
    const records = ['11:36', '12:10'].map((score, index) => ({
      id: String(index),
      score,
      createdAt: new Date('2026-11-26T22:00:00Z'),
      wod: { userId: ['a', 'b'][index]! },
    }));
    const data = buildMonthlyRanking(rankingUsers, records, '2026-11', 'a');
    expect(data.athletes.slice(0, 2)).toMatchObject([
      { userId: 'a', points: 100 },
      { userId: 'b', points: 75 },
    ]);
  });

  it('ignores different workouts, loads, formats, missing analysis and time caps', () => {
    const records = [rankingResult('a', '11:36'), rankingResult('b', '14:01')];
    records[0]!.wod.analysis = null;
    const other = records[1]!.wod;
    other.name = 'Different workout';
    other.rawText = 'Completely different movements';
    other.analysis!.format = 'STRENGTH';
    other.analysis!.durationMinutes = 1;
    other.analysis!.movements = [];
    other.analysis!.roundBreakdown = { invalid: true };
    const original = structuredClone(records);
    const data = rank(records);
    expect(data.summary.rankedAthletes).toBe(2);
    expect(data.athletes.slice(0, 2).map((a) => a.points)).toEqual([100, 75]);
    expect(data.athletes[1]!.performances[0]).toMatchObject({
      score: '14:01',
      workout: 'Tempo / CAP',
    });
    expect(records).toEqual(original);
  });

  it('compares rounds by completed rounds first and extra reps second without converting them', () => {
    const records = [
      '8 rounds + 12 reps',
      '8 voltas + 13 reps',
      '9 rounds',
      '8 rounds',
      '8 rounds + 12 reps',
    ].map((score, index) => rankingResult(rankingUsers[index]!.id, score));
    records.forEach((record) => {
      record.wod.analysis = null;
    });
    const data = rank(records);
    expect(data.athletes.map((a) => [a.userId, a.position, a.points])).toEqual([
      ['c', 1, 100],
      ['b', 2, 75],
      ['e', 3, 50],
      ['a', 3, 50],
      ['d', 5, 10],
    ]);
  });

  it('compares rep totals separately from rounds and times', () => {
    const data = rank([
      rankingResult('a', '185 reps'),
      rankingResult('b', '186 reps'),
      rankingResult('c', '2 rounds + 5 reps'),
      rankingResult('d', '05:00'),
    ]);
    expect(data.summary.comparableWorkouts).toBe(1);
    expect(data.athletes.slice(0, 2)).toMatchObject([
      { userId: 'b', points: 100 },
      { userId: 'a', points: 75 },
    ]);
    expect(data.athletes.slice(2).every((a) => a.points == null)).toBe(true);
  });

  it('uses only the latest valid score type per athlete and its best attempt', () => {
    const records = [
      rankingResult('a', '04:00'),
      rankingResult('b', '05:00'),
      rankingResult('a', '8 rounds', { createdAt: new Date('2026-11-16T16:00:00Z') }),
      rankingResult('c', '7 rounds'),
      rankingResult('a', '6 rounds', { createdAt: new Date('2026-11-16T17:00:00Z') }),
      rankingResult('a', 'invalid', { createdAt: new Date('2026-11-16T18:00:00Z') }),
    ];
    const data = rank(records);
    expect(data.athletes.find((a) => a.userId === 'a')).toMatchObject({
      points: 100,
      comparedWorkouts: 1,
      performances: [{ score: '8 rounds' }],
    });
    expect(data.athletes.find((a) => a.userId === 'b')!.points).toBeNull();
    expect(data.summary).toMatchObject({ recordedResults: 6, uncomparedResults: 4 });
    expect(rank([...records].reverse())).toEqual(data);
  });

  it.each([
    '12',
    '12:99',
    'zero',
    '0:00',
    '225 lb',
    '8 rounds extra',
    '1000001 reps',
    '1000001 rounds',
    '8 rounds + 1000001 reps',
    '601 min',
  ])('keeps an unrecognized or out-of-range score %s out of the ranking', (score) => {
    expect(
      rank([rankingResult('a', '05:00'), rankingResult('b', score)]).summary.rankedAthletes,
    ).toBe(0);
  });

  it('normalizes result notation and awards tied times the same points', () => {
    const data = rank([
      rankingResult('a', '  12,5 MIN  '),
      rankingResult('b', '12:30 min'),
      rankingResult('c', 'CAP 5 repetições'),
    ]);
    expect(data.athletes.slice(0, 3).map((a) => [a.position, a.points])).toEqual([
      [1, 100],
      [1, 100],
      [3, 50],
    ]);
  });

  it.each([
    [2, [100, 75]],
    [3, [100, 75, 50]],
    [4, [100, 75, 50, 25]],
    [5, [100, 75, 50, 25, 10]],
    [6, [100, 75, 50, 25, 10, 10]],
    [7, [100, 75, 50, 25, 10, 10, 10]],
  ] as const)(
    'awards fixed placement points and 10 points from fifth place with %i participants',
    (count, expected) => {
      const users = Array.from({ length: count }, (_, index) => ({
        id: `athlete-${index}`,
        name: `Athlete ${index}`,
      }));
      const data = buildMonthlyRanking(
        users,
        users.map((u, index) => rankingResult(u.id, `${index + 5}:00`)),
        '2026-11',
        users[0]!.id,
      );
      const ranked = data.athletes.filter((a) => a.position != null);
      expect(ranked.map((a) => a.points)).toEqual(expected);
      expect(ranked.every((a) => a.performances[0]?.athletes === count)).toBe(true);
    },
  );

  it('recalculates all days of the month using the same fixed placement table', () => {
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
        result.createdAt = new Date(`2026-11-${day}T15:00:00Z`);
        return result;
      }),
    );
    const data = rank(results);
    expect(data.athletes.slice(0, 4).map((a) => [a.userId, a.points])).toEqual([
      ['a', 225],
      ['b', 200],
      ['d', 150],
      ['c', 75],
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
          createdAt: new Date(`2026-11-${14 + day}T15:00:00Z`),
        }),
      ),
    );
    const data = buildMonthlyRanking(
      rankingUsers,
      results,
      '2026-11',
      'a',
      new Date('2026-11-16T23:00:00Z'),
    );
    const athlete = data.athletes.find((a) => a.userId === 'a')!;
    expect(athlete.points).toBe(225);
    expect(athlete.comparedWorkouts).toBe(3);
    expect(athlete.performances.map((p) => p.points)).toEqual([100, 75, 50]);
    expect(athlete.todayPerformances).toMatchObject([{ points: 50, date: '2026-11-16' }]);
    expect(new Set(athlete.performances.map((p) => p.date)).size).toBe(3);
    const tomorrow = buildMonthlyRanking(
      rankingUsers,
      results,
      '2026-11',
      'a',
      new Date('2026-11-17T23:00:00Z'),
    );
    expect(tomorrow.athletes.find((a) => a.userId === 'a')).toMatchObject({
      points: 225,
      todayPerformances: [],
    });
    const nextMonth = buildMonthlyRanking(
      rankingUsers,
      results,
      '2026-12',
      'a',
      new Date('2026-12-01T15:00:00Z'),
    );
    expect(nextMonth.athletes.every((a) => a.points == null)).toBe(true);
  });

  it('awards one daily score regardless of the workouts performed', () => {
    const now = new Date('2026-11-21T23:00:00Z');
    const dailyResults = ['09:30', '10:30', '11:10', '11:58'].map((score, index) => {
      const result = calorieBikeRankingResult(['a', 'b', 'c', 'd'][index]!, score);
      result.createdAt = new Date('2026-11-21T22:00:00Z');
      return result;
    });
    const oldWod = rankingResult('a', '12:05', { createdAt: new Date('2026-11-21T15:00:00Z') });
    const oldPeer = rankingResult('c', '13:15', { createdAt: new Date('2026-11-21T15:00:00Z') });
    const yesterday = rankingResult('a', '07:00', { createdAt: new Date('2026-11-20T15:00:00Z') });
    const records = [oldWod, oldPeer, yesterday, ...dailyResults];
    const data = buildDailyRanking(rankingUsers, records, 'a', now);
    expect(data.date).toBe('2026-11-21');
    expect(
      data.athletes.slice(0, 4).map((a) => [a.userId, a.position, a.points, a.comparedWorkouts]),
    ).toEqual([
      ['a', 1, 100, 1],
      ['b', 2, 75, 1],
      ['c', 3, 50, 1],
      ['d', 4, 25, 1],
    ]);
    expect(data.athletes.flatMap((a) => a.performances).map((p) => p.score)).not.toContain('12:05');
    expect(data.athletes.every((a) => a.points == null || a.points <= 100)).toBe(true);
    expect(buildDailyRanking(rankingUsers, [...records].reverse(), 'a', now)).toEqual(data);
    const month = buildMonthlyRanking(rankingUsers, records, '2026-11', 'a', now);
    expect(month.athletes.slice(0, 4).map((a) => a.points)).toEqual([100, 75, 50, 25]);
    expect(month.athletes.find((a) => a.userId === 'a')?.comparedWorkouts).toBe(1);
  });

  it('uses the best repeated attempt only for the latest valid result type of today', () => {
    const now = new Date('2026-11-16T23:00:00Z');
    const a = calorieBikeRankingResult('a', '09:30');
    const b = calorieBikeRankingResult('b', '10:30');
    const repeat = calorieBikeRankingResult('a', '11:00');
    repeat.createdAt = new Date('2026-11-16T16:00:00Z');
    const invalid = rankingResult('a', 'invalid', { createdAt: new Date('2026-11-16T17:00:00Z') });
    const data = buildDailyRanking(rankingUsers, [a, b, repeat, invalid], 'a', now);
    expect(data.athletes[0]).toMatchObject({ points: 100, comparedWorkouts: 1 });
    expect(data.athletes[0]?.performances).toMatchObject([{ score: '09:30', points: 100 }]);
  });

  it('starts a new daily ranking at Sao Paulo midnight without carrying previous points', () => {
    const records = [rankingResult('a', '05:00'), rankingResult('b', '06:00')];
    const data = buildDailyRanking(rankingUsers, records, 'a', new Date('2026-11-17T03:00:00Z'));
    expect(data.date).toBe('2026-11-17');
    expect(data.summary.recordedResults).toBe(0);
    expect(data.athletes.every((a) => a.points == null && a.performances.length === 0)).toBe(true);
  });

  it('shows only today and ranks today attempts independently of an older monthly best', () => {
    const previous = calorieBikeRankingResult('a', '08:00');
    previous.createdAt = new Date('2026-11-15T15:00:00Z');
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
      '2026-11',
      'a',
      new Date('2026-11-16T15:00:00Z'),
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
    previous.createdAt = new Date('2026-11-15T15:00:00Z');
    const data = buildMonthlyRanking(
      rankingUsers,
      [previous, rankingResult('b', '06:00')],
      '2026-11',
      'b',
      new Date('2026-11-16T15:00:00Z'),
    );
    expect(data.summary.rankedAthletes).toBe(0);
    expect(data.athletes.every((a) => a.todayPerformances.length === 0)).toBe(true);
  });

  it('uses Sao Paulo day boundaries and shows no daily details for an older selected month', () => {
    const a = rankingResult('a', '05:00', { createdAt: new Date('2026-11-17T02:59:00Z') });
    const b = rankingResult('b', '06:00', { createdAt: new Date('2026-11-16T03:00:00Z') });
    const c = rankingResult('c', '07:00', { createdAt: new Date('2026-11-17T03:00:00Z') });
    const data = buildMonthlyRanking(
      rankingUsers,
      [a, b, c],
      '2026-11',
      'a',
      new Date('2026-11-17T02:59:59Z'),
    );
    expect(data.athletes.find((a) => a.userId === 'a')?.todayPerformances[0]?.athletes).toBe(2);
    expect(data.athletes.find((a) => a.userId === 'c')?.todayPerformances).toEqual([]);
    const older = buildMonthlyRanking(
      rankingUsers,
      [a, b, c],
      '2026-11',
      'a',
      new Date('2026-12-01T15:00:00Z'),
    );
    expect(older.athletes.every((a) => a.todayPerformances.length === 0)).toBe(true);
  });

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
      ['b', 2, 75],
      ['c', 3, 50],
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
    otherA.createdAt = otherB.createdAt = new Date('2026-11-17T15:00:00Z');
    otherA.wod.rawText = otherB.wod.rawText = 'Other prescription';
    otherA.wod.analysis!.movements[0]!.reps = otherB.wod.analysis!.movements[0]!.reps = 30;
    const results = [rankingResult('a', '05:00'), rankingResult('b', '06:00'), otherA, otherB];
    const before = rank(results);
    const after = rank([...results, rankingResult('a', '06:30')]);
    expect(after.athletes).toEqual(before.athletes);
    expect(after.athletes.slice(0, 2).map((athlete) => [athlete.position, athlete.points])).toEqual(
      [
        [1, 175],
        [1, 175],
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
    secondB.createdAt = secondC.createdAt = new Date('2026-11-17T15:00:00Z');
    secondB.wod.analysis!.movements[0]!.reps = 30;
    secondC.wod.analysis!.movements[0]!.reps = 30;
    const data = rank([rankingResult('a', '05:00'), rankingResult('b', '06:00'), secondB, secondC]);
    expect(data.athletes.slice(0, 3)).toMatchObject([
      { userId: 'b', position: 1, points: 175, comparedWorkouts: 2 },
      { userId: 'a', position: 2, points: 100, comparedWorkouts: 1 },
      { userId: 'c', position: 3, points: 75, comparedWorkouts: 1 },
    ]);
    expect(data.summary.comparableWorkouts).toBe(2);
  });

  it('includes every submitter in one WOD standings and recalculates when more arrive', () => {
    const initial = [rankingResult('a', '05:00'), rankingResult('b', '06:00')];
    expect(rank(initial).athletes.find((athlete) => athlete.userId === 'b')?.points).toBe(75);
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
      ['a', 75],
      ['b', 50],
      ['d', 25],
      ['e', 10],
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
          `2026-11-${reps === 45 ? 14 : reps === 30 ? 15 : 16}T15:00:00Z`,
        );
        result.wod.analysis!.movements[0]!.reps = reps;
        return result;
      }),
    );
    const athlete = rank(results).athletes.find((entry) => entry.userId === 'b')!;
    expect(athlete.performances.map((performance) => performance.points)).toEqual([75, 75, 75]);
    expect(athlete.points).toBe(225);
  });

  it('requires two distinct athletes rather than two attempts from one athlete', () => {
    expect(
      rank([rankingResult('a', '05:00'), rankingResult('a', '06:00')]).summary.rankedAthletes,
    ).toBe(0);
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

  it('uses São Paulo month boundaries and the original result date', () => {
    expect(rankingMonth(new Date('2026-12-01T02:59:59Z'))).toBe('2026-11');
    expect(rankingMonth(new Date('2026-12-01T03:00:00Z'))).toBe('2026-12');
    const data = rank([
      rankingResult('a', '05:00', { createdAt: new Date('2026-11-01T02:59:59Z') }),
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
