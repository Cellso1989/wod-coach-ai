import { describe, expect, it } from 'vitest';
import { benchmarkCases, summarizeLatency } from '../../scripts/benchmark-wod-latency.js';

describe('latency comparison report', () => {
  it('does not hide failures or retries behind fast successful samples', () => {
    const [low, medium] = summarizeLatency([
      { effort: 'low', success: true, durationMs: 10, attemptCount: 1 },
      { effort: 'low', success: false, durationMs: 120000, attemptCount: 2 },
      { effort: 'medium', success: true, durationMs: 30, attemptCount: 1 },
      { effort: 'medium', success: true, durationMs: 50, attemptCount: 2 },
    ]);
    expect(low).toMatchObject({
      samples: 2,
      failures: 1,
      retried: 1,
      successP50Ms: 10,
      allP95Ms: 120000,
    });
    expect(medium).toMatchObject({ successes: 2, retried: 1, successP50Ms: 30, successP95Ms: 50 });
    expect(summarizeLatency([])[0].successP50Ms).toBeNull();
  });
  it('uses valid fixed analyses for AMRAP, ladders and scored intervals', () => {
    const cases = benchmarkCases();
    expect(cases.map((c) => c.id)).toEqual(['amrap', 'ladder', 'scored-intervals']);
    expect(cases[1].input.wodAnalysis.rounds!.map((r) => r.movements.map((m) => m.reps))).toEqual([
      [21, 21, 12],
      [15, 15, 10],
      [9, 9, 8],
    ]);
    expect(cases[2].input.wodAnalysis.movements[2].loadDescription).toBeNull();
  });
});
