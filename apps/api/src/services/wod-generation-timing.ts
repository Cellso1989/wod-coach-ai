import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AiValidationObservation } from '@wod-coach-ai/coach-engine';
import type { AiAttemptTiming } from './ai-generation-metadata.js';
import { wodMeasurementId, WOD_TELEMETRY_INSTANCE_ID } from './wod-generation-http-timing.js';
import type { MeasureWodDatabase, WodDatabaseOperation } from './wod-database-timing.js';

type Stage = 'sourceRead' | 'context' | 'profile' | 'analysisRead' | 'ai' | 'persistence';

/** Durations use a monotonic clock. Logs contain no prompts, photos or athlete data. */
export function observeWodGeneration(
  request: FastifyRequest,
  reply: FastifyReply,
  operation: 'ANALYSIS' | 'STRATEGY',
) {
  const started = performance.now();
  const stages: Partial<Record<Stage, number>> = {};
  const attempts: Array<Pick<AiAttemptTiming, 'durationMs' | 'status'> & Partial<AiAttemptTiming>> =
    [];
  const validations: AiValidationObservation[] = [];
  const databaseOperations: Array<{
    operation: WodDatabaseOperation;
    durationMs: number;
    status: 'succeeded' | 'failed';
  }> = [];
  const measureDatabase: MeasureWodDatabase = async (operation, work) => {
    const start = performance.now();
    let status: 'succeeded' | 'failed' = 'failed';
    try {
      const result = await work();
      status = 'succeeded';
      return result;
    } finally {
      databaseOperations.push({ operation, durationMs: performance.now() - start, status });
    }
  };
  let sourceType: string | null = null;
  return {
    measureDatabase,
    setSourceType(value: string) {
      sourceType = value;
    },
    recordAttempt(attempt: (typeof attempts)[number]) {
      attempts.push({ ...attempt });
    },
    recordValidation(event: AiValidationObservation) {
      validations.push(structuredClone(event));
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
            schemaVersion: 2,
            instanceId: WOD_TELEMETRY_INSTANCE_ID,
            requestId: request.id ?? null,
            measurementId: wodMeasurementId(request),
            operation,
            sourceType,
            // Thrown errors are mapped to HTTP codes later by the error handler.
            statusCode: thrown ? null : reply.statusCode,
            outcome: thrown || reply.statusCode >= 400 ? 'failed' : 'succeeded',
            durationMs: performance.now() - started,
            stages,
            attempts,
            validations,
            databaseOperations,
            aiSummary: {
              attemptCount: attempts.length,
              correctionAttempted: attempts.length > 1,
              correctionRequested: validations.some((item) => item.willRetry),
              corrected:
                validations.some((item) => item.status === 'rejected') &&
                validations.some((item) => item.status === 'accepted'),
              rejectedResponses: validations.filter((item) => item.status === 'rejected').length,
              acceptedResponses: validations.filter((item) => item.status === 'accepted').length,
            },
          },
          'WOD generation timing',
        );
      }
    },
  };
}
