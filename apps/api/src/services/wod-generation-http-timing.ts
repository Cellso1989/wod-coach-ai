import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';

export const WOD_TELEMETRY_INSTANCE_ID = randomUUID();

export type WodGenerationOperation = 'ANALYSIS' | 'STRATEGY';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function wodMeasurementId(request: FastifyRequest): string | null {
  const value = request.headers?.['x-wod-measurement-id'];
  return typeof value === 'string' && UUID.test(value) ? value : null;
}

/** HTTP lifetime includes authentication and serialization, unlike route work timing. */
export function registerWodGenerationHttpTiming(app: FastifyInstance) {
  const active = new WeakMap<
    FastifyRequest,
    { started: number; operation: WodGenerationOperation }
  >();
  app.addHook('onRequest', async (request) => {
    if (request.method !== 'POST') return;
    const route = request.routeOptions.url;
    const operation =
      route === '/api/wods/:id/analyze'
        ? 'ANALYSIS'
        : route === '/api/wods/:id/strategy'
          ? 'STRATEGY'
          : null;
    if (operation) active.set(request, { started: performance.now(), operation });
  });
  app.addHook('onResponse', async (request, reply) => {
    const timing = active.get(request);
    if (!timing) return;
    active.delete(request);
    request.log.info(
      {
        event: 'wod_generation_http_timing',
        schemaVersion: 1,
        instanceId: WOD_TELEMETRY_INSTANCE_ID,
        uptimeSeconds: Math.round(process.uptime()),
        requestId: request.id,
        measurementId: wodMeasurementId(request),
        operation: timing.operation,
        phase:
          reply.statusCode === 202
            ? 'enqueue'
            : request.user?.generationJobId
              ? 'worker'
              : 'synchronous',
        statusCode: reply.statusCode,
        outcome: reply.statusCode < 400 ? 'succeeded' : 'failed',
        durationMs: performance.now() - timing.started,
      },
      'CrossFit generation HTTP timing',
    );
  });
}
