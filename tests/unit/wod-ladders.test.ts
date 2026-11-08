import { describe, expect, it, vi } from 'vitest';
import {
  analyzeWod,
  compactLadderAnalysisIssue,
  generateStrategy,
  readCompactLadders,
  StrategyGenerationError,
  WodAnalysisError,
  type StrategyCoachInput,
} from '@wod-coach-ai/coach-engine';
import { ladderAnalysis, ladderSource, ladderStrategy } from '../fixtures/wod-ladder-case.js';

const input: StrategyCoachInput = {
  wodAnalysis: ladderAnalysis,
  athleteProfile: null,
  athleteContext: {
    trainingLoad: {
      last7Days: { days: 7, sessionCount: 0 },
      last14Days: { days: 14, sessionCount: 0 },
      last28Days: { days: 28, sessionCount: 0 },
    },
    similarWods: [],
    relevantPersonalRecords: [],
    dataSufficiency: 'low',
  },
};

describe('compact WOD ladders retain execution order', () => {
  it.each(['Bar m.u', 'Bar m.u.', 'BMU', 'Bar Muscle-up'])(
    'recognizes %s without losing T2B',
    (alias) => {
      expect(readCompactLadders(ladderSource.replace('Bar m.u', alias))).toEqual([
        { name: 'thruster', reps: [21, 15, 9] },
        { name: 'toes to bar', reps: [21, 15, 9] },
        { name: 'bar muscle up', reps: [12, 10, 8] },
      ]);
    },
  );
  it.each([
    'For Time\n40-60kg\nThrusters',
    'EMOM\n21-15-9\nThrusters',
    '21-15-9\nThrusters\nDepois\n12-10-8\nBMU',
    '21-15-9\nThrusters\n12-10\nBMU',
    '21-15-9\nThrusters\nMovimento desconhecido',
    '21-15-9\nThrusters\n12:10\nBMU',
    '21-15-9\nThrusters 40kg',
  ])('does not partially infer an unsupported prescription: %s', (source) => {
    expect(readCompactLadders(source)).toBeNull();
  });
  it.each(['text', 'image'] as const)(
    'rejects aggregate-only analysis from %s',
    async (sourceType) => {
      const send = vi.fn().mockResolvedValue({
        text: JSON.stringify({
          ...ladderAnalysis,
          rounds: null,
          extractedText: sourceType === 'image' ? ladderSource : null,
        }),
      });
      await expect(
        analyzeWod(
          sourceType === 'image'
            ? { imageBase64: 'mock-image', imageMimeType: 'image/png' }
            : { rawText: ladderSource },
          send,
        ),
      ).rejects.toBeInstanceOf(WodAnalysisError);
      expect(send).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(send.mock.calls[1])).toContain('21-15-9');
    },
  );
  it('rejects six separate phases or reordered movements despite correct totals', () => {
    const rounds = ladderAnalysis.rounds!;
    const phases = [
      ...rounds.map((round) => ({ ...round, movements: round.movements.slice(0, 2) })),
      ...rounds.map((round, index) => ({
        ...round,
        roundNumber: index + 4,
        movements: round.movements.slice(2),
      })),
    ];
    expect(compactLadderAnalysisIssue({ rounds: phases }, ladderSource)).not.toBeNull();
    expect(
      compactLadderAnalysisIssue(
        {
          rounds: rounds.map((round) => ({ ...round, movements: [...round.movements].reverse() })),
        },
        ladderSource,
      ),
    ).not.toBeNull();
  });
  it('retries and accepts only exact rounds including BMU in each round', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ text: JSON.stringify({ ...ladderAnalysis, rounds: null }) })
      .mockResolvedValueOnce({ text: JSON.stringify(ladderAnalysis) });
    expect(await analyzeWod({ rawText: ladderSource }, send)).toEqual({
      ...ladderAnalysis,
      durationMinutes: null,
      warnings: expect.any(Array),
    });
  });
  it('rejects different round reps even if aggregate totals still match', async () => {
    const rounds = structuredClone(ladderAnalysis.rounds!);
    rounds[0]!.movements[0]!.reps = 22;
    rounds[1]!.movements[0]!.reps = 14;
    const send = vi.fn().mockResolvedValue({ text: JSON.stringify({ ...ladderAnalysis, rounds }) });
    await expect(analyzeWod({ rawText: ladderSource }, send)).rejects.toBeInstanceOf(
      WodAnalysisError,
    );
  });
  it('preserves sequential phases when the source explicitly says Depois', async () => {
    const rounds = ladderAnalysis.rounds!;
    const phases = [
      ...rounds.map((round) => ({ ...round, movements: round.movements.slice(0, 2) })),
      ...rounds.map((round, index) => ({
        ...round,
        roundNumber: index + 4,
        movements: round.movements.slice(2),
      })),
    ];
    const output = { ...ladderAnalysis, rounds: phases };
    const send = vi.fn().mockResolvedValue({ text: JSON.stringify(output) });
    expect(
      await analyzeWod({ rawText: ladderSource.replace('12-10-8', 'Depois\n12-10-8') }, send),
    ).toEqual({ ...output, durationMinutes: null, warnings: expect.any(Array) });
  });
  it('accepts explicit per-round labels with numbering after a buy-in', async () => {
    const analysis = {
      ...ladderAnalysis,
      movements: [ladderAnalysis.movements[0]!],
      rounds: ladderAnalysis.rounds!.map((round) => ({
        ...round,
        roundNumber: round.roundNumber + 1,
        movements: [round.movements[0]!],
      })),
    };
    const entries = analysis.rounds.map((round) => ({
      movement: `Thrusters (round ${round.roundNumber} - ${round.movements[0]!.reps} reps)`,
      strategy: 'Quebre antes da falha.',
    }));
    const output = { ...ladderStrategy, breakStrategy: entries, movementStrategy: entries };
    const send = vi.fn().mockResolvedValue({ text: JSON.stringify(output) });
    expect(await generateStrategy({ ...input, wodAnalysis: analysis }, send)).toEqual(output);
  });
  it.each(['breakStrategy', 'movementStrategy'] as const)(
    'rejects aggregate labels in %s',
    async (field) => {
      const send = vi.fn().mockResolvedValue({
        text: JSON.stringify({
          ...ladderStrategy,
          [field]: [{ movement: 'Thrusters (45 reps)', strategy: '3x15.' }],
        }),
      });
      await expect(generateStrategy(input, send)).rejects.toBeInstanceOf(StrategyGenerationError);
      expect(send).toHaveBeenCalledTimes(2);
    },
  );
  it('rejects continuous aggregate sets even when the ladder label is correct', async () => {
    const send = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        ...ladderStrategy,
        breakStrategy: ladderStrategy.breakStrategy.map((entry) => ({
          ...entry,
          strategy: '3x15.',
        })),
      }),
    });
    await expect(generateStrategy(input, send)).rejects.toBeInstanceOf(StrategyGenerationError);
  });
  it('correctively retries aggregate advice and returns per-round breaks', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        text: JSON.stringify({
          ...ladderStrategy,
          breakStrategy: [{ movement: 'Thrusters (45 reps)', strategy: '3x15.' }],
        }),
      })
      .mockResolvedValueOnce({ text: JSON.stringify(ladderStrategy) });
    expect(await generateStrategy(input, send)).toEqual(ladderStrategy);
  });

  it.each([
    'Round 1: 7/7/7; Round 2: 7/7/7; Round 3: 9 direto.',
    'R1: 3x7; R2: 7 + 7; R3: 9 direto.',
    'Bloco 1: 21; Bloco 2: 8/7; Bloco 3: 2x5.',
    'Round 1: 15 direto; Round 2: 8/7; Round 3: 9 direto.',
  ])('rejects an explicit round break that disagrees with its own volume: %s', async (strategy) => {
    const output = structuredClone(ladderStrategy);
    output.breakStrategy[0]!.strategy = strategy;
    const send = vi.fn().mockResolvedValue({ text: JSON.stringify(output) });
    await expect(generateStrategy(input, send)).rejects.toBeInstanceOf(StrategyGenerationError);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it.each(['breakStrategy', 'movementStrategy'] as const)(
    'rejects incorrect sets in a separate round-labelled %s entry',
    async (field) => {
      const output = structuredClone(ladderStrategy);
      output[field] = [
        { movement: 'Thrusters (Round 1 - 21 reps)', strategy: '3x7.' },
        { movement: 'Thrusters (Round 2 - 15 reps)', strategy: '3x7.' },
        { movement: 'Thrusters (Round 3 - 9 reps)', strategy: '9 direto.' },
        ...output[field].slice(1),
      ];
      const send = vi.fn().mockResolvedValue({ text: JSON.stringify(output) });
      await expect(generateStrategy(input, send)).rejects.toBeInstanceOf(StrategyGenerationError);
    },
  );

  it('retries incorrect per-round arithmetic and returns only the corrected plan', async () => {
    const invalid = structuredClone(ladderStrategy);
    invalid.breakStrategy[0]!.strategy = 'R1: 7/7/7; R2: 7/7/7; R3: 9 direto.';
    const send = vi
      .fn()
      .mockResolvedValueOnce({ text: JSON.stringify(invalid) })
      .mockResolvedValueOnce({ text: JSON.stringify(ladderStrategy) });
    expect(await generateStrategy(input, send)).toEqual(ladderStrategy);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('uses actual round numbers after a buy-in when checking explicit sets', async () => {
    const analysis = structuredClone(ladderAnalysis);
    for (const round of analysis.rounds!) round.roundNumber += 1;
    const output = structuredClone(ladderStrategy);
    for (const field of ['breakStrategy', 'movementStrategy'] as const) {
      output[field] = analysis.rounds!.map((round) => ({
        movement: `Thrusters (Round ${round.roundNumber} - ${round.movements[0]!.reps} reps)`,
        strategy: round.roundNumber === 2 ? '3x7.' : round.roundNumber === 3 ? '8/7.' : '9 direto.',
      }));
    }
    analysis.movements = [analysis.movements[0]!];
    for (const round of analysis.rounds!) round.movements = [round.movements[0]!];
    const send = vi.fn().mockResolvedValue({ text: JSON.stringify(output) });
    expect(await generateStrategy({ ...input, wodAnalysis: analysis }, send)).toEqual(output);
    output.breakStrategy[1]!.strategy = '3x7.';
    send.mockResolvedValue({ text: JSON.stringify(output) });
    await expect(
      generateStrategy({ ...input, wodAnalysis: analysis }, send),
    ).rejects.toBeInstanceOf(StrategyGenerationError);
  });
  it.each([
    'R1: 3x7; R2: 8 + 7; R3: 9 reps direto.',
    'Round 1: 21; Round 2: 8/7; Round 3: 9 unbroken.',
    'Round 2: 20s/10s; respire e retome com tecnica.',
    'Quebre antes da falha; ajuste as series conforme o grip.',
  ])(
    'preserves valid arithmetic or advice outside the supported count grammar: %s',
    async (strategy) => {
      const output = structuredClone(ladderStrategy);
      output.breakStrategy[0]!.strategy = strategy;
      const send = vi.fn().mockResolvedValue({ text: JSON.stringify(output) });
      expect(await generateStrategy(input, send)).toEqual(output);
      expect(send).toHaveBeenCalledTimes(1);
    },
  );
});
