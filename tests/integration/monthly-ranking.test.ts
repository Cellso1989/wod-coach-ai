import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../apps/api/src/app.js';
import {
  calorieBikeRankingResult,
  rankingResult,
  rankingUsers,
} from '../fixtures/monthly-ranking.js';

const mocks = vi.hoisted(() => ({
  users: vi.fn(),
  results: vi.fn(),
  profile: vi.fn(),
  saveProfile: vi.fn(),
}));
vi.mock('../../packages/database/dist/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@wod-coach-ai/database')>()),
  prisma: {
    user: { findMany: mocks.users },
    wodResult: { findMany: mocks.results },
    athleteProfile: { findUnique: mocks.profile, upsert: mocks.saveProfile },
    $transaction: async (work: (tx: unknown) => Promise<unknown>) =>
      work({
        athleteProfile: { upsert: mocks.saveProfile },
        pushSubscription: { deleteMany: vi.fn() },
        rankingNotification: { deleteMany: vi.fn() },
        resultAnnouncement: { deleteMany: vi.fn() },
      }),
    $disconnect: vi.fn(),
  },
}));

describe('monthly ranking API', () => {
  let app: ReturnType<typeof buildApp>;
  let headers: { authorization: string };
  beforeEach(async () => {
    vi.clearAllMocks();
    app = buildApp();
    await app.ready();
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'b' })).toString('base64url');
    const unsigned = `${header}.${payload}`;
    headers = {
      authorization: `Bearer ${unsigned}.${createHmac('sha256', process.env.JWT_SECRET!).update(unsigned).digest('base64url')}`,
    };
    mocks.users.mockResolvedValue(
      rankingUsers.map((user) => ({ ...user, email: 'private@example.com' })),
    );
    mocks.results.mockResolvedValue([rankingResult('a', '05:00'), rankingResult('b', '06:00')]);
  });
  afterEach(async () => {
    await app.close();
  });

  it('requires authentication before any cross-user query', async () => {
    const response = await app.inject({ url: '/api/ranking/monthly?month=2026-10' });
    expect(response.statusCode).toBe(401);
    expect(mocks.users).not.toHaveBeenCalled();
    expect(mocks.results).not.toHaveBeenCalled();
  });

  it('ranks results with only athlete identity and never selects workout analysis', async () => {
    mocks.results.mockResolvedValue([
      {
        id: 'a1',
        score: '11:36',
        createdAt: new Date('2026-10-26T22:00:00Z'),
        wod: { userId: 'a' },
      },
      {
        id: 'b1',
        score: '12:10',
        createdAt: new Date('2026-10-26T22:00:00Z'),
        wod: { userId: 'b' },
      },
    ]);
    const response = await app.inject({ url: '/api/ranking/monthly?month=2026-10', headers });
    expect(response.statusCode).toBe(200);
    expect(response.json().athletes.slice(0, 2)).toMatchObject([
      { userId: 'a', points: 100 },
      { userId: 'b', points: 75 },
    ]);
    expect(mocks.results.mock.calls[0]![0].select).toEqual({
      id: true,
      score: true,
      createdAt: true,
      wod: { select: { userId: true } },
    });
  });

  it('requires authentication on the daily ranking too', async () => {
    const response = await app.inject({ url: '/api/ranking/daily' });
    expect(response.statusCode).toBe(401);
    expect(mocks.results).not.toHaveBeenCalled();
  });

  it('returns whole daily points and sums those integers into the monthly total', async () => {
    mocks.results.mockResolvedValue([
      rankingResult('a', '08:05'),
      rankingResult('b', '09:15'),
      rankingResult('c', '09:50'),
      rankingResult('a', '05:00', { createdAt: new Date('2026-10-15T15:00:00Z') }),
      rankingResult('b', '06:00', { createdAt: new Date('2026-10-15T15:00:00Z') }),
    ]);
    const response = await app.inject({ url: '/api/ranking/monthly?month=2026-10', headers });
    expect(response.statusCode).toBe(200);
    const data = response.json();
    expect(data.athletes.slice(0, 3)).toMatchObject([
      { userId: 'a', points: 200 },
      { userId: 'b', points: 150 },
      { userId: 'c', points: 50 },
    ]);
    for (const athlete of data.athletes) {
      for (const performance of athlete.performances)
        expect(Number.isInteger(performance.points)).toBe(true);
      if (athlete.points != null) expect(Number.isInteger(athlete.points)).toBe(true);
    }
  });

  it('serves only one score per athlete for today instead of accumulated monthly points', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-16T23:00:00Z'));
    try {
      const results = ['09:30', '10:30', '11:10', '11:58'].map((score, index) =>
        calorieBikeRankingResult(['a', 'b', 'c', 'd'][index]!, score),
      );
      const old = rankingResult('a', '12:05', { createdAt: new Date('2026-10-16T10:00:00Z') });
      const oldPeer = rankingResult('c', '13:15', { createdAt: new Date('2026-10-16T10:00:00Z') });
      mocks.results.mockResolvedValue([old, oldPeer, ...results]);
      const response = await app.inject({ url: '/api/ranking/daily', headers });
      expect(response.statusCode).toBe(200);
      expect(response.json().date).toBe('2026-10-16');
      expect(response.json().athletes.slice(0, 4)).toMatchObject([
        { userId: 'a', points: 100, comparedWorkouts: 1 },
        { userId: 'b', points: 75, comparedWorkouts: 1 },
        { userId: 'c', points: 50, comparedWorkouts: 1 },
        { userId: 'd', points: 25, comparedWorkouts: 1 },
      ]);
      expect(response.headers['cache-control']).toBe('private, no-store');
    } finally {
      vi.useRealTimers();
    }
  });

  it('includes an existing Bike score in the monthly standings alongside Bike calories', async () => {
    mocks.results.mockResolvedValue([
      rankingResult('a', '09:39', { createdAt: new Date('2026-10-15T15:00:00Z') }),
      rankingResult('b', '10:05', { createdAt: new Date('2026-10-15T15:00:00Z') }),
      calorieBikeRankingResult('a', '11:10 min', 'Bike calories'),
      calorieBikeRankingResult('b', '11:58'),
    ]);
    const response = await app.inject({ url: '/api/ranking/monthly?month=2026-10', headers });
    expect(response.statusCode).toBe(200);
    const athlete = response
      .json()
      .athletes.find((entry: { userId: string }) => entry.userId === 'b');
    expect(athlete).toMatchObject({ points: 150, comparedWorkouts: 2 });
    expect(athlete.performances).toContainEqual(
      expect.objectContaining({ score: '11:58', points: 75 }),
    );
  });

  it.each(['2026-13', 'invalid', '2026-1', '2026-00'])(
    'rejects invalid month %s before querying',
    async (month) => {
      expect(
        (await app.inject({ url: `/api/ranking/monthly?month=${month}`, headers })).statusCode,
      ).toBe(400);
      expect(mocks.results).not.toHaveBeenCalled();
    },
  );

  it('lets any authenticated athlete see the ranking with only the intended fields', async () => {
    const response = await app.inject({ url: '/api/ranking/monthly?month=2026-10', headers });
    expect(response.statusCode).toBe(200);
    const data = response.json();
    expect(data.summary.users).toBe(5);
    expect(data.athletes[1]).toMatchObject({
      userId: 'b',
      position: 2,
      points: 75,
      isCurrentUser: true,
    });
    expect(response.body).not.toContain('private@example.com');
    expect(response.body).not.toContain('rawResponse');
    expect(response.body).not.toContain('rawText');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(mocks.users).toHaveBeenCalledWith({
      where: { athleteProfile: { is: { rankingOptIn: true } } },
      select: { id: true, name: true },
    });
    expect(mocks.results).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          createdAt: {
            gte: new Date('2026-10-01T00:00:00Z'),
            lt: new Date('2026-11-02T00:00:00Z'),
          },
          wod: { discipline: 'CROSSFIT', user: { athleteProfile: { is: { rankingOptIn: true } } } },
        },
      }),
    );
  });

  it('compares matching loads and repetitions despite different source text and notes', async () => {
    const a = rankingResult('a', '9:15 min');
    const b = rankingResult('b', '9:50');
    a.wod.rawText = `Wod\n${a.wod.rawText}`;
    b.wod.rawText = 'Outro texto descrevendo a mesma prescrição';
    b.wod.notes = 'Observação pessoal';
    mocks.results.mockResolvedValue([a, b]);
    const response = await app.inject({ url: '/api/ranking/monthly?month=2026-10', headers });
    expect(response.statusCode).toBe(200);
    expect(response.json().summary).toMatchObject({ rankedAthletes: 2, comparableWorkouts: 1 });
    expect(response.json().athletes.slice(0, 2)).toMatchObject([
      { userId: 'a', position: 1, points: 100 },
      { userId: 'b', position: 2, points: 75 },
    ]);
  });

  it('returns unclassified users for a month without results', async () => {
    mocks.results.mockResolvedValue([]);
    const response = await app.inject({ url: '/api/ranking/monthly?month=2026-09', headers });
    expect(response.json().athletes).toHaveLength(5);
    expect(response.json().summary.rankedAthletes).toBe(0);
    expect(
      response.json().athletes.every((athlete: { position: unknown }) => athlete.position === null),
    ).toBe(true);
  });

  it('returns cumulative monthly standings with all submitters in each WOD', async () => {
    const first = rankingUsers.map((user, index) => rankingResult(user.id, `0${index + 5}:00`));
    for (const result of first) result.createdAt = new Date('2026-10-15T15:00:00Z');
    const second = ['b', 'c', 'd', 'e'].map((userId, index) => {
      const result = rankingResult(userId, `0${index + 5}:00`);
      result.wod.analysis!.movements[0]!.reps = 30;
      return result;
    });
    mocks.results.mockResolvedValue([...first, ...second]);
    const response = await app.inject({ url: '/api/ranking/monthly?month=2026-10', headers });
    expect(response.statusCode).toBe(200);
    const data = response.json();
    expect(data.summary).toMatchObject({ comparableWorkouts: 2, rankedAthletes: 5 });
    expect(data.athletes).toMatchObject([
      { userId: 'b', position: 1, points: 175, comparedWorkouts: 2 },
      { userId: 'c', position: 2, points: 125, comparedWorkouts: 2 },
      { userId: 'a', position: 3, points: 100, comparedWorkouts: 1 },
      { userId: 'd', position: 4, points: 75, comparedWorkouts: 2 },
      { userId: 'e', position: 5, points: 35, comparedWorkouts: 2 },
    ]);
    expect(data.athletes[0].performances).toMatchObject([{ athletes: 5 }, { athletes: 4 }]);
  });

  it('returns positive points ordered by remaining CAP reps after finishers', async () => {
    mocks.results.mockResolvedValue([
      rankingResult('a', '14:00'),
      rankingResult('b', 'CAP 20'),
      rankingResult('c', 'CAP 10'),
      rankingResult('d', 'CAP 5'),
    ]);
    const response = await app.inject({ url: '/api/ranking/monthly?month=2026-10', headers });
    expect(response.statusCode).toBe(200);
    expect(
      response
        .json()
        .athletes.slice(0, 4)
        .map((athlete: { userId: string; points: number }) => [athlete.userId, athlete.points]),
    ).toEqual([
      ['a', 100],
      ['d', 75],
      ['c', 50],
      ['b', 25],
    ]);
    expect(response.json().athletes[1].performances[0]).toMatchObject({
      status: 'cap',
      remainingReps: 5,
      points: 75,
    });
  });

  it('removes an opted-out athlete and their results from every requested month and recalculates comparisons', async () => {
    let optedIn = true;
    mocks.users.mockImplementation(async () =>
      rankingUsers.filter((user) => user.id !== 'b' || optedIn),
    );
    mocks.saveProfile.mockImplementation(async ({ where, update }) => {
      expect(where).toEqual({ userId: 'b' });
      optedIn = update.rankingOptIn;
      return { userId: 'b', rankingOptIn: optedIn };
    });
    let response = await app.inject({ url: '/api/ranking/monthly?month=2026-10', headers });
    expect(response.json().summary.rankedAthletes).toBe(2);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/athlete-profile',
          headers,
          payload: { rankingOptIn: false, userId: 'a' },
        })
      ).statusCode,
    ).toBe(200);
    for (const month of ['2026-10', '2026-09']) {
      response = await app.inject({ url: `/api/ranking/monthly?month=${month}`, headers });
      expect(
        response.json().athletes.some((athlete: { userId: string }) => athlete.userId === 'b'),
      ).toBe(false);
      expect(response.json().summary.rankedAthletes).toBe(0);
      expect(response.json().summary.users).toBe(4);
    }
    await app.inject({
      method: 'PUT',
      url: '/api/athlete-profile',
      headers,
      payload: { rankingOptIn: true },
    });
    response = await app.inject({ url: '/api/ranking/monthly?month=2026-10', headers });
    expect(
      response.json().athletes.find((athlete: { userId: string }) => athlete.userId === 'b'),
    ).toMatchObject({ position: 2, points: 75 });
  });

  it('persists the explicit choice only for the authenticated user and preserves it for older clients', async () => {
    let optedIn = false;
    mocks.profile.mockImplementation(async () => ({ userId: 'b', rankingOptIn: optedIn }));
    mocks.saveProfile.mockImplementation(async ({ where, create, update }) => {
      expect(where).toEqual({ userId: 'b' });
      expect(create.userId).toBe('b');
      if (update.rankingOptIn !== undefined) optedIn = update.rankingOptIn;
      return { userId: 'b', rankingOptIn: optedIn };
    });
    const invoke = (payload: object) =>
      app.inject({ method: 'PUT', url: '/api/athlete-profile', headers, payload });
    expect((await invoke({ rankingOptIn: true })).json().profile.rankingOptIn).toBe(true);
    expect((await invoke({ weightKg: 80 })).json().profile.rankingOptIn).toBe(true);
    expect(
      (await app.inject({ url: '/api/athlete-profile', headers })).json().profile.rankingOptIn,
    ).toBe(true);
    expect((await invoke({ rankingOptIn: 'false' })).statusCode).toBe(400);
    expect((await invoke({ rankingOptIn: false })).json().profile.rankingOptIn).toBe(false);
  });
});
