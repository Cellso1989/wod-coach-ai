import { describe, it, expect } from 'vitest';
// @ts-expect-error Standalone JavaScript CLI.
import { summarizeWodGenerationLogs } from '../../scripts/summarize-wod-generation.mjs';
describe('performance cohorts', () => {
  it('separates release, source, output cap and queue mode, with explicit small-sample limits', () => {
    const base = {
      event: 'wod_generation_timing',
      schemaVersion: 2,
      operation: 'STRATEGY',
      sourceType: 'TEXT',
      release: 'aaaaaaa',
      durationMs: 100,
      attempts: [
        {
          requestedModel: 'model',
          requestedReasoningEffort: 'medium',
          promptVersion: 'hash',
          maxOutputTokens: 8000,
        },
      ],
      aiSummary: {},
    };
    const result = summarizeWodGenerationLogs([
      base,
      { ...base, release: 'bbbbbbb' },
      { ...base, sourceType: 'IMAGE' },
      { ...base, executionMode: 'queued' },
      { ...base, attempts: [{ ...base.attempts[0], maxOutputTokens: 4000 }] },
    ]);
    expect(Object.keys(result.groups[1].byCohort)).toHaveLength(5);
    for (const cohort of Object.values(result.groups[1].byCohort) as Array<
      Record<string, unknown>
    >) {
      expect(cohort).toMatchObject({
        minimumSamples: 30,
        sampleAssessment: 'insufficient_for_stable_p95',
      });
    }
  });
  it('does not treat a 202 enqueue response as full generation HTTP latency', () => {
    const common = {
      operation: 'STRATEGY',
      measurementId: 'm',
      schemaVersion: 1,
      outcome: 'succeeded',
    };
    const result = summarizeWodGenerationLogs([
      {
        ...common,
        event: 'wod_generation_http_timing',
        phase: 'enqueue',
        instanceId: 'api',
        requestId: '1',
        durationMs: 10,
      },
      {
        ...common,
        event: 'wod_generation_http_timing',
        phase: 'worker',
        instanceId: 'worker',
        requestId: '1',
        durationMs: 100,
      },
      {
        ...common,
        event: 'wod_generation_job_timing',
        durationMs: 150,
        queueWaitMs: 50,
        statusCode: 200,
      },
      { ...common, event: 'wod_generation_client_timing', durationMs: 180 },
    ]);
    expect(result.groups[1]).toMatchObject({
      http: { count: 0 },
      matchedClientHttp: 0,
      queued: { completed: 1, total: { p50Ms: 150 }, wait: { p50Ms: 50 }, enqueue: { p50Ms: 10 } },
    });
  });
});
