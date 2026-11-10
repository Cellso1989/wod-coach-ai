import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import type { FastifyInstance } from 'fastify';
import wodRoutes from '../../apps/api/src/routes/wod.js';

const db = vi.hoisted(() => ({ findFirst: vi.fn(), transaction: vi.fn() }));
vi.mock('../../packages/database/dist/index.js', async (original) => ({
  ...(await original<typeof import('@wod-coach-ai/database')>()),
  prisma: { wod: { findFirst: db.findFirst }, $transaction: db.transaction },
}));
const requireApi = createRequire(new URL('../../apps/api/package.json', import.meta.url));
let app: FastifyInstance;
const detail = {
  id: 'wod',
  userId: 'athlete',
  rawText: '21-15-9 Thrusters e T2B',
  imageMimeType: 'image/png',
  result: { score: '05:00' },
  analysis: {
    versionId: 'analysis-v1',
    roundBreakdown: [{ roundNumber: 1 }],
    warnings: [],
    rawResponse: null,
  },
  strategy: { versionId: 'strategy-v1', target: '5-6 min' },
};

beforeEach(async () => {
  vi.resetAllMocks();
  app = requireApi('fastify')() as FastifyInstance;
  app.decorate('authenticate', async (request, reply) => {
    if (!request.headers['x-athlete']) return reply.code(401).send({ error: 'Não autenticado' });
    request.user = { sub: String(request.headers['x-athlete']) };
  });
  app.register(wodRoutes);
  db.transaction.mockImplementation((work) => work({ wod: { findFirst: db.findFirst } }));
  db.findFirst.mockResolvedValue(detail);
});
afterEach(async () => {
  await app.close();
});

describe('lightweight WOD detail', () => {
  it('reads all projections from one snapshot, scoped to the athlete, without selecting image bytes', async () => {
    const response = await app.inject({
      url: '/wods/wod?view=detail',
      headers: { 'x-athlete': 'athlete' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      detailVersion: 1,
      wod: {
        id: 'wod',
        userId: 'athlete',
        rawText: detail.rawText,
        imageMimeType: 'image/png',
        result: detail.result,
      },
      analysis: detail.analysis,
      strategy: detail.strategy,
    });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(db.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
    expect(db.findFirst).toHaveBeenCalledTimes(1);
    const query = db.findFirst.mock.calls[0][0];
    expect(query.where).toEqual({ id: 'wod', userId: 'athlete', discipline: 'CROSSFIT' });
    expect(query.select.imageData).toBeUndefined();
    expect(query.select.analysis.include.movements.orderBy).toEqual({ order: 'asc' });
  });

  it('distinguishes absent projections from a failed or missing read', async () => {
    db.findFirst.mockResolvedValueOnce({ ...detail, analysis: null, strategy: null });
    const headers = { 'x-athlete': 'athlete' };
    expect((await app.inject({ url: '/wods/wod?view=detail', headers })).json()).toMatchObject({
      analysis: null,
      strategy: null,
    });
    db.findFirst.mockResolvedValueOnce(null);
    expect((await app.inject({ url: '/wods/foreign?view=detail', headers })).statusCode).toBe(404);
    db.transaction.mockRejectedValueOnce(new Error('Database unavailable'));
    expect((await app.inject({ url: '/wods/wod?view=detail', headers })).statusCode).toBe(500);
  });

  it('preserves the original full detail contract for existing clients', async () => {
    const full = { id: 'wod', imageData: 'aW1hZ2U=', result: detail.result };
    db.findFirst.mockResolvedValueOnce(full);
    const response = await app.inject({ url: '/wods/wod', headers: { 'x-athlete': 'athlete' } });
    expect(response.json()).toEqual({ wod: full });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it.each(['/wods/wod?view=detail', '/wods/wod/image'])(
    'requires authentication for %s',
    async (url) => {
      expect((await app.inject({ url })).statusCode).toBe(401);
      expect(db.findFirst).not.toHaveBeenCalled();
      expect(db.transaction).not.toHaveBeenCalled();
    },
  );

  it('serves the image separately with ownership and no-store, preserving bytes and MIME', async () => {
    const bytes = Buffer.from('fixture image bytes');
    db.findFirst.mockResolvedValueOnce({
      imageData: bytes.toString('base64'),
      imageMimeType: 'image/png',
    });
    const response = await app.inject({
      url: '/wods/wod/image',
      headers: { 'x-athlete': 'athlete' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.rawPayload).toEqual(bytes);
    expect(response.headers['content-type']).toBe('image/png');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(db.findFirst.mock.calls[0][0].where).toEqual({
      id: 'wod',
      userId: 'athlete',
      discipline: 'CROSSFIT',
    });
  });

  it.each([
    null,
    { imageData: null, imageMimeType: 'image/png' },
    { imageData: 'YWJj', imageMimeType: 'text/html' },
  ])('does not expose missing or unsupported images: %j', async (row) => {
    db.findFirst.mockResolvedValueOnce(row);
    expect(
      (await app.inject({ url: '/wods/foreign/image', headers: { 'x-athlete': 'athlete' } }))
        .statusCode,
    ).toBe(404);
  });
});
