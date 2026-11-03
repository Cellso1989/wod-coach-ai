import type { FastifyReply, FastifyRequest } from 'fastify';

type Stage = 'sourceRead' | 'context' | 'profile' | 'analysisRead' | 'ai' | 'persistence';

/** Durations use a monotonic clock. Logs contain no prompts, photos or athlete data. */
export function observeWodGeneration(
  request: FastifyRequest,
  reply: FastifyReply,
  operation: 'ANALYSIS' | 'STRATEGY',
) {
  const started = performance.now();
  const stages: Partial<Record<Stage, number>> = {};
  const attempts: Array<{ durationMs: number; status: 'received' | 'failed' }> = [];
  let sourceType: string | null = null;
  return {
    setSourceType(value: string) {
      sourceType = value;
    },
    recordAttempt(attempt: (typeof attempts)[number]) {
      attempts.push({ ...attempt });
    },
    async measure<T>(stage: Stage, work: () => Promise<T>): Promise<T> {
      const start = performance.now();
      try {
        return await work();
      } finally {
        stages[stage] = (stages[stage] ?? 0) + performance.now() - start;
      }
    },
    async run<T>(work: () => Promise<T>): Promise<T> {
      let thrown = false;
      try {
        return await work();
      } catch (error) {
        thrown = true;
        throw error;
      } finally {
        request.log.info(
          {
            event: 'wod_generation_timing',
            operation,
            sourceType,
            // Thrown errors are mapped to HTTP codes later by the error handler.
            statusCode: thrown ? null : reply.statusCode,
            outcome: thrown || reply.statusCode >= 400 ? 'failed' : 'succeeded',
            durationMs: performance.now() - started,
            stages,
            attempts,
          },
          'WOD generation timing',
        );
      }
    },
  };
}
