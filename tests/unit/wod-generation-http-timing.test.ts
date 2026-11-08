import { createRequire } from 'node:module';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerWodGenerationHttpTiming } from '../../apps/api/src/services/wod-generation-http-timing.js';
import metricsRoutes from '../../apps/api/src/routes/wod-generation-metrics.js';

const id = '6df01b70-31e6-4db3-9a0c-7fb09ec9dd94';
const requireApi = createRequire(new URL('../../apps/api/package.json', import.meta.url));
let app: FastifyInstance;
const records: Record<string, unknown>[] = [];
beforeEach(async () => {
  records.length = 0;
  app = requireApi('fastify')({
    logger: { stream: { write: (line: string) => records.push(JSON.parse(line)) } },
  }) as FastifyInstance;
  app.decorate('authenticate', async (request, reply) => {
    if (request.headers.authorization !== 'Bearer valid')
      return reply.code(401).send({ error: 'Denied' });
  });
  app.register(requireApi('@fastify/rate-limit'), { max: 300, timeWindow: '1 minute' });
  registerWodGenerationHttpTiming(app);
  app.post('/api/wods/:id/analyze', { onRequest: app.authenticate }, async () => ({
    analysis: {},
  }));
  app.post('/api/wods/:id/strategy', async () => {
    throw new Error('failed');
  });
  app.post('/api/hyrox-workouts/:id/analyze', async () => ({}));
  app.register(metricsRoutes, { prefix: '/api' });
  await app.ready();
});
afterEach(async () => {
  await app.close();
  vi.restoreAllMocks();
});

describe('generation HTTP and client metrics', () => {
  it('measures the final HTTP failure even before a generation starts', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/wods/private-id/analyze',
      headers: { 'x-wod-measurement-id': id },
    });
    expect(response.statusCode).toBe(401);
    const event = records.find((r) => r.event === 'wod_generation_http_timing');
    expect(event).toMatchObject({
      measurementId: id,
      operation: 'ANALYSIS',
      statusCode: 401,
      outcome: 'failed',
      requestId: expect.any(String),
      instanceId: expect.any(String),
      durationMs: expect.any(Number),
    });
    expect(JSON.stringify(event)).not.toContain('private-id');
  });

  it('gets the error-handler status and rejects arbitrary correlation headers', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/wods/wod/strategy',
      headers: { 'x-wod-measurement-id': 'private athlete name' },
    });
    expect(records.find((r) => r.event === 'wod_generation_http_timing')).toMatchObject({
      measurementId: null,
      operation: 'STRATEGY',
      statusCode: 500,
    });
  });

  it('does not add generation telemetry to HYROX', async () => {
    await app.inject({ method: 'POST', url: '/api/hyrox-workouts/wod/analyze' });
    expect(records.some((r) => r.event === 'wod_generation_http_timing')).toBe(false);
  });

  it('requires authentication for client measurements', async () => {
    expect(
      (await app.inject({ method: 'POST', url: '/api/wod-generation-metrics', payload: {} }))
        .statusCode,
    ).toBe(401);
    expect(records.some((r) => r.event === 'wod_generation_client_timing')).toBe(false);
  });

  it('logs a strict bounded payload and does not persist athlete content', async () => {
    const metric = {
      measurementId: id,
      operation: 'ANALYSIS',
      durationMs: 123,
      outcome: 'succeeded',
    };
    const send = (payload: unknown) =>
      app.inject({
        method: 'POST',
        url: '/api/wod-generation-metrics',
        headers: { authorization: 'Bearer valid' },
        payload,
      });
    expect((await send(metric)).statusCode).toBe(204);
    for (const payload of [
      { ...metric, rawText: 'private' },
      { ...metric, durationMs: -1 },
      { ...metric, durationMs: 1_800_001 },
      { ...metric, operation: 'HYROX' },
      { ...metric, measurementId: 'private' },
    ]) {
      expect((await send(payload)).statusCode).toBe(400);
    }
    expect(records.filter((r) => r.event === 'wod_generation_client_timing')).toHaveLength(1);
    expect(records.find((r) => r.event === 'wod_generation_client_timing')).toMatchObject(metric);
  });

  it('limits telemetry traffic independently of generation requests', async () => {
    for (let i = 0; i < 31; i++) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/wod-generation-metrics',
        headers: { authorization: 'Bearer valid' },
        payload: { measurementId: id, operation: 'ANALYSIS', durationMs: 10, outcome: 'succeeded' },
      });
      expect(response.statusCode).toBe(i < 30 ? 204 : 429);
    }
  });
});
