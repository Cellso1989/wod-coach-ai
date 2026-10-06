import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../apps/api/src/app.js';

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), findFirst: vi.fn(), upsert: vi.fn() }));
vi.mock('../../packages/database/dist/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@wod-coach-ai/database')>()),
  prisma: {
    wod: { findFirst: mocks.findFirst },
    wodResult: { findMany: mocks.findMany, upsert: mocks.upsert },
    $disconnect: vi.fn(),
  },
}));

describe('training calendar', () => {
  let app: ReturnType<typeof buildApp>;
  let token: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = buildApp();
    await app.ready();
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'athlete-1' })).toString('base64url');
    const unsigned = `${header}.${payload}`;
    token = `${unsigned}.${createHmac('sha256', process.env.JWT_SECRET!).update(unsigned).digest('base64url')}`;
    mocks.findMany.mockResolvedValue([]);
  });

  afterEach(async () => {
    await app.close();
  });

  const path = (start = '2026-10-05T03:00:00.000Z', end = '2026-10-12T03:00:00.000Z') =>
    `/api/stats/training-calendar?${new URLSearchParams({ start, end })}`;

  it('requires authentication', async () => {
    const response = await app.inject({ url: path() });
    expect(response.statusCode).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('uses first result creation, athlete ownership and exclusive local-week boundaries', async () => {
    mocks.findMany.mockResolvedValue([
      {
        createdAt: new Date('2026-10-06T02:30:00Z'),
        score: '12:34',
        wod: { id: 'wod-1', name: 'Fran', discipline: 'CROSSFIT' },
      },
      {
        createdAt: new Date('2026-10-06T14:00:00Z'),
        score: '45:00',
        wod: { id: 'hyrox-1', name: null, discipline: 'HYROX' },
      },
    ]);
    const response = await app.inject({
      url: path(),
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          wod: { userId: 'athlete-1' },
          createdAt: {
            gte: new Date('2026-10-05T03:00:00Z'),
            lt: new Date('2026-10-12T03:00:00Z'),
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
    );
    expect(response.json().entries).toEqual([
      {
        completedAt: '2026-10-06T02:30:00.000Z',
        score: '12:34',
        wodId: 'wod-1',
        name: 'Fran',
        discipline: 'CROSSFIT',
      },
      {
        completedAt: '2026-10-06T14:00:00.000Z',
        score: '45:00',
        wodId: 'hyrox-1',
        name: null,
        discipline: 'HYROX',
      },
    ]);
  });

  it('returns an empty week without results', async () => {
    const response = await app.inject({
      url: path(),
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.json()).toEqual({ entries: [] });
  });

  it('shows a newly saved result and preserves its completion date when edited', async () => {
    const headers = { authorization: `Bearer ${token}` };
    const completedAt = new Date('2026-10-06T18:00:00Z');
    const wod = { id: 'wod-1', userId: 'athlete-1', name: 'Fran', discipline: 'CROSSFIT' };
    let stored: { createdAt: Date; score: string; wod: typeof wod } | null = null;
    mocks.findFirst.mockResolvedValue(wod);
    mocks.upsert.mockImplementation(({ create, update }) => {
      stored = stored
        ? { ...stored, score: update.score }
        : { createdAt: completedAt, score: create.score, wod };
      return { id: 'result-1', createdAt: stored.createdAt, score: stored.score };
    });
    mocks.findMany.mockImplementation(() => (stored ? [stored] : []));
    expect((await app.inject({ url: path(), headers })).json().entries).toEqual([]);
    for (const score of ['12:34', '11:30']) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/wods/wod-1/result',
        headers,
        payload: { score },
      });
      expect(response.statusCode).toBe(201);
      expect((await app.inject({ url: path(), headers })).json().entries).toEqual([
        {
          completedAt: completedAt.toISOString(),
          score,
          wodId: 'wod-1',
          name: 'Fran',
          discipline: 'CROSSFIT',
        },
      ]);
    }
    expect(mocks.upsert).toHaveBeenLastCalledWith({
      where: { wodId: 'wod-1' },
      create: { wodId: 'wod-1', score: '11:30' },
      update: { score: '11:30' },
    });
  });

  it.each([
    ['invalid', '2026-10-12T03:00:00.000Z'],
    ['2026-10-12T03:00:00.000Z', '2026-10-05T03:00:00.000Z'],
    ['2026-10-05T03:00:00.000Z', '2026-10-05T03:00:00.000Z'],
    ['2026-10-05T03:00:00.000Z', '2026-11-05T03:00:00.000Z'],
  ])('rejects invalid or unbounded ranges (%s, %s)', async (start, end) => {
    const response = await app.inject({
      url: path(start, end),
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(400);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
