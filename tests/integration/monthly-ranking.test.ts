import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../apps/api/src/app.js';
import { rankingResult, rankingUsers } from '../fixtures/monthly-ranking.js';

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
      points: 50,
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

  it('returns unclassified users for a month without results', async () => {
    mocks.results.mockResolvedValue([]);
    const response = await app.inject({ url: '/api/ranking/monthly?month=2026-09', headers });
    expect(response.json().athletes).toHaveLength(5);
    expect(response.json().summary.rankedAthletes).toBe(0);
    expect(
      response.json().athletes.every((athlete: { position: unknown }) => athlete.position === null),
    ).toBe(true);
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
    ).toMatchObject({ position: 2, points: 50 });
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
