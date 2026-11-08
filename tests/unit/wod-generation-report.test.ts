import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error The standalone log reader is an ES module executable without a build step.
import {
  parseLogLine,
  summarizeWodGenerationLogs,
} from '../../scripts/summarize-wod-generation.mjs';

describe('CrossFit production log report', () => {
  it('summarizes per-call database waits without treating overlapping operations as additive', () => {
    const result = summarizeWodGenerationLogs([
      {
        ...work('a', false, 100),
        databaseOperations: [
          { operation: 'profile', durationMs: 30, status: 'succeeded' },
          { operation: 'lease.assert', durationMs: 10, status: 'succeeded' },
          { operation: 'lease.assert', durationMs: 20, status: 'failed' },
        ],
      },
      work('older', false, 50),
    ]);
    expect(result.groups[0].databaseOperations).toEqual({
      profile: { count: 1, p50Ms: 30, p95Ms: 30, maxMs: 30, failures: 0 },
      'lease.assert': { count: 2, p50Ms: 10, p95Ms: 20, maxMs: 20, failures: 1 },
    });
    expect(result.groups[0].routeWork).toMatchObject({ count: 2, p50Ms: 50, maxMs: 100 });
    expect(result.groups[1].databaseOperations).toEqual({});
  });
  const work = (id: string, correction: boolean, durationMs: number, outcome = 'succeeded') => ({
    event: 'wod_generation_timing',
    schemaVersion: 2,
    operation: 'ANALYSIS',
    sourceType: 'TEXT',
    measurementId: id,
    durationMs,
    outcome,
    stages: { ai: durationMs - 10 },
    attempts: correction ? [{ durationMs: 10 }, { durationMs: 20 }] : [{ durationMs: 10 }],
    aiSummary: {
      correctionAttempted: correction,
      corrected: correction && outcome === 'succeeded',
    },
    validations: correction
      ? [
          {
            status: 'rejected',
            reason: 'schema',
            durationMs: 1,
            issues: [{ field: 'rounds', code: 'custom' }],
          },
        ]
      : [],
  });

  it('uses all AI-started generations as the correction denominator, including failures', () => {
    const result = summarizeWodGenerationLogs([
      work('a', false, 20),
      work('b', true, 40),
      work('c', true, 100, 'failed'),
      { ...work('no-ai', false, 1, 'failed'), attempts: [] },
      work('b', true, 40), // repeated log export
      { ...work('legacy', true, 99), schemaVersion: undefined },
    ]);
    expect(result.duplicatesIgnored).toBe(1);
    expect(result.legacyWorkEventsExcluded).toBe(1);
    expect(result.groups[0]).toMatchObject({
      aiStarted: 3,
      correctionRate: { numerator: 2, denominator: 3 },
      correctionRecoveryRate: { numerator: 1, denominator: 2, percent: 50 },
      persistedAfterCorrection: 1,
      routeFailures: 2,
      routeWork: { count: 4, p50Ms: 20, p95Ms: 100 },
      rejectionFields: { 'rounds:custom': 2 },
    });
    expect(result.groups[1].correctionRate.percent).toBeNull();
  });

  it('keeps HTTP/auth errors separate and only compares matched client/server operations', () => {
    const result = summarizeWodGenerationLogs([
      {
        event: 'wod_generation_http_timing',
        operation: 'ANALYSIS',
        measurementId: 'a',
        durationMs: 20,
        outcome: 'succeeded',
      },
      {
        event: 'wod_generation_client_timing',
        operation: 'ANALYSIS',
        measurementId: 'a',
        durationMs: 35,
        outcome: 'succeeded',
      },
      {
        event: 'wod_generation_http_timing',
        operation: 'ANALYSIS',
        instanceId: 'one',
        requestId: 'req-1',
        durationMs: 5,
        outcome: 'failed',
      },
      {
        event: 'wod_generation_http_timing',
        operation: 'ANALYSIS',
        instanceId: 'two',
        requestId: 'req-1',
        durationMs: 7,
        outcome: 'failed',
      },
      {
        event: 'wod_generation_client_timing',
        operation: 'STRATEGY',
        measurementId: 'a',
        durationMs: 500,
        outcome: 'failed',
      },
    ]);
    expect(result.groups[0]).toMatchObject({
      http: { count: 3 },
      httpFailures: 2,
      aiStarted: 0,
      matchedClientHttp: 1,
      clientMinusHttp: { count: 1, p50Ms: 15 },
    });
    expect(result.groups[1].matchedClientHttp).toBe(0);
  });

  it('accepts prefixed and wrapped Pino JSON and skips unrelated output', () => {
    const event = work('a', false, 10);
    expect(parseLogLine(`timestamp ${JSON.stringify(event)}`)).toEqual(event);
    expect(parseLogLine(JSON.stringify({ message: JSON.stringify(event) }))).toEqual(event);
    expect(parseLogLine('deploy succeeded')).toBeNull();
    expect(parseLogLine('{"event":"login"}')).toBeNull();
  });

  it('does not let a reused untrusted client ID hide separate server requests', () => {
    const report = summarizeWodGenerationLogs([
      { ...work('same', false, 10), instanceId: 'one', requestId: 'req-1' },
      { ...work('same', true, 40), instanceId: 'one', requestId: 'req-2' },
      ...['req-1', 'req-2'].map((requestId) => ({
        event: 'wod_generation_http_timing',
        operation: 'ANALYSIS',
        instanceId: 'one',
        requestId,
        measurementId: 'same',
        durationMs: 50,
      })),
      {
        event: 'wod_generation_client_timing',
        operation: 'ANALYSIS',
        measurementId: 'same',
        durationMs: 70,
      },
    ]);
    expect(report.groups[0]).toMatchObject({
      aiStarted: 2,
      correctionRate: { percent: 50 },
      matchedHttpWork: 2,
      matchedClientHttp: 0,
      ambiguousMeasurementIds: 1,
    });
  });

  it('runs the standalone CLI against UTF-8 exports and never treats missing usage as measured zero', () => {
    const directory = mkdtempSync(join(tmpdir(), 'crossfit-metrics-'));
    const file = join(directory, 'logs.jsonl');
    writeFileSync(file, `${JSON.stringify(work('cli', false, 30))}\nnot a metric\n`, 'utf8');
    try {
      const output = execFileSync(
        process.execPath,
        [
          fileURLToPath(new URL('../../scripts/summarize-wod-generation.mjs', import.meta.url)),
          file,
        ],
        { encoding: 'utf8' },
      );
      const report = JSON.parse(output);
      expect(report.input).toEqual({ fileCount: 1, parsedEvents: 1, ignoredLines: 1 });
      expect(report.groups[0].tokenUsage).toMatchObject({
        attemptsWithUsage: 0,
        attemptsWithoutUsage: 1,
      });
      expect(report.groups[0].routeWork.p50Ms).toBe(30);
    } finally {
      unlinkSync(file);
      rmdirSync(directory);
    }
  });
});
