import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const metricSchema = z
  .object({
    measurementId: z.string().uuid(),
    operation: z.enum(['ANALYSIS', 'STRATEGY']),
    durationMs: z
      .number()
      .finite()
      .min(0)
      .max(30 * 60_000),
    outcome: z.enum(['succeeded', 'failed']),
  })
  .strict();

export default async function wodGenerationMetricsRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);
  app.post(
    '/wod-generation-metrics',
    {
      bodyLimit: 1024,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const parsed = metricSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'Metrica invalida' });
      request.log.info(
        {
          event: 'wod_generation_client_timing',
          schemaVersion: 1,
          ...parsed.data,
        },
        'CrossFit generation client timing (untrusted)',
      );
      return reply.code(204).send();
    },
  );
}
