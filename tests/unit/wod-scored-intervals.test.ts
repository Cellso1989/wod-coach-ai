import { describe, expect, it, vi } from 'vitest';
import {
  analyzeWod,
  generateStrategy,
  scoredIntervalAnalysisIssue,
  WodAnalysisError,
  StrategyGenerationError,
} from '@wod-coach-ai/coach-engine';
import type { WodAnalysisOutput } from '@wod-coach-ai/validation';
import {
  productionIntervalAnalysis,
  productionIntervalSource,
} from '../fixtures/wod-scored-interval-production.js';

const source = "Wod\n4 Sets\nAmrap 3'\n200m run\n8 Ring muscle up\nMax Squat snatch 43kg\nRest 1'";
const movements = [
  { name: 'Run', category: 'monostructural' as const, distanceMeters: 200 },
  { name: 'Ring muscle up', category: 'gymnastics' as const, reps: 8 },
  { name: 'Squat snatch', category: 'weightlifting' as const, reps: null, loadDescription: '43kg' },
];
const analysis: WodAnalysisOutput = {
  extractedText: source,
  format: 'INTERVAL',
  durationMinutes: 12,
  stimulus: 'engine + grip',
  movements: movements.map((m) => ({
    ...m,
    ...(m.distanceMeters ? { distanceMeters: 800 } : {}),
    ...(m.reps ? { reps: 32 } : {}),
  })),
  rounds: Array.from({ length: 4 }, (_, i) => ({
    roundNumber: i + 1,
    label: `Bloco ${i + 1}: AMRAP 3 min; rest 1 min`,
    movements,
  })),
  estimatedDemand: { engine: 8, grip: 8, legs: 8, gymnastics: 9, technical: 9 },
  estimatedIntensity: 9,
  confidence: 0.9,
  warnings: [],
};
const strategy = {
  recommendedIntensity: 9,
  targetRpe: 10,
  loadRecommendation: null,
  pacing: 'Controle a corrida em cada bloco; acelere na barra no ultimo bloco.',
  breakStrategy: [
    { movement: 'Ring muscle up (8 por bloco)', strategy: 'Individuais antes da falha.' },
  ],
  restStrategy: 'Descanse 1 min entre blocos.',
  movementStrategy: [
    { movement: 'Squat snatch', strategy: 'Individuais no tempo restante de cada bloco.' },
  ],
  transitionStrategy: 'Corrida, argolas, barra; reinicie na corrida no bloco seguinte.',
  energyManagement: 'Preserve a pegada para chegar a barra.',
  goal: 'Maximizar a soma de squat snatches nos 4 blocos.',
  target: null,
  criticalPoint: 'Ring muscle up',
  warnings: ['Sem historico suficiente para prever reps.'],
  confidence: 0.4,
};
function sender(output: unknown) {
  return vi.fn().mockResolvedValue({ text: JSON.stringify(output) });
}
const input = {
  wodAnalysis: analysis,
  athleteContext: {
    trainingLoad: {
      last7Days: { days: 7, sessionCount: 0 },
      last14Days: { days: 14, sessionCount: 0 },
      last28Days: { days: 28, sessionCount: 0 },
    },
    similarWods: [],
    relevantPersonalRecords: [],
    dataSufficiency: 'low' as const,
  },
  athleteProfile: null,
};

describe('scored AMRAP sets', () => {
  it('accepts the production image response with a distance-qualified run name', async () => {
    const send = sender(productionIntervalAnalysis);
    const result = await analyzeWod({ imageBase64: 'mock', imageMimeType: 'image/png' }, send);
    expect(result.rounds).toHaveLength(4);
    expect(result.rounds![0]!.movements[0]!.distanceMeters).toBe(200);
    expect(result.movements[0]!.distanceMeters).toBe(800);
    expect(result.movements[2]!.loadDescription).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('accepts existing saved production rounds for strategy without reanalysis', async () => {
    expect(
      scoredIntervalAnalysisIssue(productionIntervalAnalysis, productionIntervalSource),
    ).toBeNull();
    const send = sender(strategy);
    expect(
      (await generateStrategy({ ...input, wodAnalysis: productionIntervalAnalysis }, send)).goal,
    ).toBe(strategy.goal);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it.each(['400m run', '200m row', '200m run + burpees'])(
    'rejects a mismatching qualified name: %s',
    async (name) => {
      const invalid = {
        ...productionIntervalAnalysis,
        rounds: productionIntervalAnalysis.rounds!.map((round) => ({
          ...round,
          movements: round.movements.map((movement) =>
            movement.name === '200m run' ? { ...movement, name } : movement,
          ),
        })),
      };
      await expect(
        analyzeWod({ rawText: productionIntervalSource }, sender(invalid)),
      ).rejects.toBeInstanceOf(WodAnalysisError);
    },
  );
  it('preserves the original image transcription without inventing a load', async () => {
    const original = source.replace(' 43kg', '');
    const removeLoad = (m: (typeof movements)[number]) => ({ ...m, loadDescription: null });
    const send = sender({
      ...analysis,
      extractedText: original,
      movements: analysis.movements.map(removeLoad),
      rounds: analysis.rounds!.map((r) => ({ ...r, movements: r.movements.map(removeLoad) })),
    });
    const result = await analyzeWod({ imageBase64: 'mock', imageMimeType: 'image/png' }, send);
    expect(result.movements[2]!.loadDescription).toBeNull();
    expect(result.warnings.join(' ')).toContain('Carga nao informada');
  });
  it('keeps a manual duration override without changing interval timing', async () => {
    const result = await analyzeWod(
      { rawText: source, durationOverrideMinutes: 16 },
      sender(analysis),
    );
    expect(result.durationMinutes).toBe(16);
    expect(result.rounds).toEqual(analysis.rounds);
  });
  it.each(['text', 'image'])(
    'preserves ordered blocks, load and score for %s input',
    async (kind) => {
      const send = sender({ ...analysis, ...(kind === 'text' ? { extractedText: null } : {}) });
      const result = await analyzeWod(
        kind === 'text' ? { rawText: source } : { imageBase64: 'mock', imageMimeType: 'image/png' },
        send,
      );
      expect(result.rounds).toEqual(analysis.rounds);
      expect(result.extractedText).toBe(source);
      expect(result.durationMinutes).toBe(12);
      expect(send).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    { format: 'AMRAP', durationMinutes: 16, rounds: null },
    { durationMinutes: 16 },
    { rounds: analysis.rounds!.slice(0, 3) },
    { rounds: analysis.rounds!.map((r) => ({ ...r, label: 'AMRAP 13 min; rest 1 min' })) },
    {
      rounds: analysis.rounds!.map((r) => ({
        ...r,
        label: 'Bloco',
        movements: [...r.movements].reverse(),
      })),
    },
    {
      rounds: analysis.rounds!.map((r) => ({
        ...r,
        movements: r.movements.map((m) => (m.reps === 8 ? { ...m, reps: 32 } : m)),
      })),
    },
    {
      rounds: analysis.rounds!.map((r) => ({
        ...r,
        movements: r.movements.map((m) =>
          m.name === 'Squat snatch' ? { ...m, reps: 10, loadDescription: '60kg' } : m,
        ),
      })),
    },
  ])('rejects collapsed or corrupted analyses: %j', async (change) => {
    const send = sender({ ...analysis, ...change });
    await expect(analyzeWod({ rawText: source }, send)).rejects.toBeInstanceOf(WodAnalysisError);
    expect(send).toHaveBeenCalledTimes(2);
  });
  it('recovers through corrective retry', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        text: JSON.stringify({ ...analysis, format: 'AMRAP', rounds: null }),
      })
      .mockResolvedValueOnce({ text: JSON.stringify(analysis) });
    expect((await analyzeWod({ rawText: source }, send)).format).toBe('INTERVAL');
    expect(send).toHaveBeenCalledTimes(2);
  });
  it('does not partially recognize unknown phases or notes', () => {
    expect(
      scoredIntervalAnalysisIssue({ format: 'AMRAP', rounds: null }, `${source}\nThen 20 burpees`),
    ).toBeNull();
  });
  it('accepts an honest target without inventing a rep range', async () => {
    const send = sender(strategy);
    expect((await generateStrategy(input, send)).target).toBeNull();
    expect(JSON.stringify(send.mock.calls[0])).toContain('scoreAggregation');
  });
  it('recovers a wrong score target through corrective retry', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        text: JSON.stringify({ ...strategy, target: '2-3 rounds em 16:00' }),
      })
      .mockResolvedValueOnce({ text: JSON.stringify(strategy) });
    expect((await generateStrategy(input, send)).goal).toBe(strategy.goal);
    expect(send).toHaveBeenCalledTimes(2);
  });
  it('accepts a score in snatch reps when a prediction is available', async () => {
    const send = sender({ ...strategy, target: '20-24 squat snatches somados nos 4 blocos' });
    expect((await generateStrategy(input, send)).target).toContain('squat snatches');
  });
  it.each([
    { target: '2-3 rounds completos em 16:00' },
    { goal: 'Completar rounds consistentes.' },
    { restStrategy: 'Respire entre transicoes.' },
    { pacing: "Controle nas primeiras 6'; acelere nos ultimos 6'." },
  ])('rejects the reported continuous-AMRAP advice: %j', async (change) => {
    const send = sender({ ...strategy, ...change });
    await expect(generateStrategy(input, send)).rejects.toBeInstanceOf(StrategyGenerationError);
    expect(send).toHaveBeenCalledTimes(2);
  });
  it('rejects a legacy analysis before accepting interval advice', async () => {
    await expect(
      generateStrategy({ ...input, wodAnalysis: { ...analysis, rounds: null } }, sender(strategy)),
    ).rejects.toBeInstanceOf(StrategyGenerationError);
  });
});
