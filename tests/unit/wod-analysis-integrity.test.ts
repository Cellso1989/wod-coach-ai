import { describe, expect, it, vi } from 'vitest';
import { analyzeWod, WodAnalysisError } from '@wod-coach-ai/coach-engine';

const movement = { name: 'Thruster', category: 'weightlifting', reps: 10, loadDescription: '40kg' };
const valid = {
  format: 'ROUNDS_FOR_TIME',
  durationMinutes: 12,
  stimulus: 'mixed_modal',
  movements: [{ ...movement, reps: 20 }],
  rounds: [1, 2].map((roundNumber) => ({ roundNumber, movements: [movement] })),
  estimatedDemand: { engine: 7, grip: 6, legs: 7, gymnastics: 2, technical: 5 },
  estimatedIntensity: 8,
  confidence: 0.9,
  warnings: [],
};

describe('analysis internal integrity', () => {
  it.each(['distanceMeters', 'calories'] as const)(
    'rejects inconsistent %s totals',
    async (metric) => {
      const item = { name: 'Row', category: 'monostructural', [metric]: 10 };
      const send = vi.fn().mockResolvedValue({
        text: JSON.stringify({
          ...valid,
          movements: [{ ...item, [metric]: 200 }],
          rounds: [1, 2].map((roundNumber) => ({ roundNumber, movements: [item] })),
        }),
      });
      await expect(analyzeWod({ rawText: 'Row intervals' }, send)).rejects.toBeInstanceOf(
        WodAnalysisError,
      );
    },
  );

  it.each([
    ['wrong total', { movements: [{ ...movement, reps: 200 }] }],
    ['missing aggregate movement', { movements: [{ ...movement, name: 'Burpee', reps: 20 }] }],
    [
      'invented aggregate movement',
      { movements: [...valid.movements, { ...movement, name: 'Run' }] },
    ],
    [
      'unknown round volume with a known total',
      {
        rounds: [valid.rounds[0], { roundNumber: 2, movements: [{ ...movement, reps: null }] }],
      },
    ],
    ['category disagreement', { movements: [{ ...movement, reps: 20, category: 'gymnastics' }] }],
    [
      'uniform load disagreement',
      { movements: [{ ...movement, reps: 20, loadDescription: '80kg' }] },
    ],
    ['duplicate aggregate name', { movements: [...valid.movements, ...valid.movements] }],
    [
      'unordered blocks without explicit round count',
      {
        rounds: [valid.rounds[1], valid.rounds[0]],
      },
    ],
  ])('rejects %s after corrective retry', async (_name, change) => {
    const send = vi.fn().mockResolvedValue({ text: JSON.stringify({ ...valid, ...change }) });
    await expect(analyzeWod({ rawText: 'For Time: Thrusters' }, send)).rejects.toBeInstanceOf(
      WodAnalysisError,
    );
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('retries inconsistent totals and returns only the corrected analysis', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        text: JSON.stringify({ ...valid, movements: [{ ...movement, reps: 200 }] }),
      })
      .mockResolvedValueOnce({ text: JSON.stringify(valid) });
    expect(await analyzeWod({ rawText: '2 rounds: 10 Thruster 40kg' }, send)).toEqual(valid);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      'swapped names',
      '2 rounds\n10 Burpee',
      { name: 'Thruster', category: 'weightlifting', reps: 20 },
    ],
    [
      'varying loads',
      '2 rounds\n10 Thruster 40/60kg',
      { ...movement, reps: 20, loadDescription: '40/60kg' },
    ],
    [
      'hidden load',
      '2 rounds\n10 Thruster 40kg',
      { name: 'Thruster', category: 'weightlifting', reps: 20 },
    ],
  ])('does not reconstruct ambiguous rounds: %s', async (_name, rawText, aggregate) => {
    const send = vi.fn().mockResolvedValue({
      text: JSON.stringify({ ...valid, rounds: null, movements: [aggregate] }),
    });
    await expect(analyzeWod({ rawText }, send)).rejects.toBeInstanceOf(WodAnalysisError);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('accepts unknown totals without inventing a number', async () => {
    const output = { ...valid, movements: [{ ...movement, reps: null }] };
    const send = vi.fn().mockResolvedValue({ text: JSON.stringify(output) });
    expect(
      (await analyzeWod({ rawText: '2 rounds: Thrusters' }, send)).movements[0].reps,
    ).toBeNull();
  });
});

describe('analysis fidelity to a simple explicit source', () => {
  const rawText = 'For Time\n10 Burpees\n400m Run\n20 cal Row';
  const sourceAnalysis = {
    ...valid,
    format: 'FOR_TIME',
    durationMinutes: null,
    rounds: null,
    movements: [
      { name: 'Burpee', category: 'conditioning', reps: 10 },
      { name: 'Run', category: 'monostructural', distanceMeters: 400 },
      { name: 'Row', category: 'monostructural', calories: 20 },
    ],
  };

  it.each([
    { format: 'AMRAP' },
    { durationMinutes: 12 },
    { movements: [...sourceAnalysis.movements].reverse() },
    { rounds: [{ roundNumber: 1, movements: [...sourceAnalysis.movements].reverse() }] },
    {
      rounds: [1, 2].map((roundNumber) => ({
        roundNumber,
        movements: sourceAnalysis.movements.map((item) => ({
          ...item,
          reps: item.reps == null ? undefined : item.reps / 2,
          distanceMeters: item.distanceMeters == null ? undefined : item.distanceMeters / 2,
          calories: item.calories == null ? undefined : item.calories / 2,
        })),
      })),
    },
  ])('rejects format, invented cap, order or fabricated execution blocks: %j', async (change) => {
    const send = vi
      .fn()
      .mockResolvedValue({ text: JSON.stringify({ ...sourceAnalysis, ...change }) });
    await expect(analyzeWod({ rawText }, send)).rejects.toBeInstanceOf(WodAnalysisError);
  });

  it('rejects a changed AMRAP work window', async () => {
    const send = vi
      .fn()
      .mockResolvedValue({
        text: JSON.stringify({ ...sourceAnalysis, format: 'AMRAP', durationMinutes: 15 }),
      });
    await expect(
      analyzeWod({ rawText: rawText.replace('For Time', 'AMRAP 12 min') }, send),
    ).rejects.toBeInstanceOf(WodAnalysisError);
  });

  it.each([
    ['omitted movement', sourceAnalysis.movements.slice(1)],
    ['invented movement', [...sourceAnalysis.movements, { ...movement, reps: 10 }]],
    ['changed reps', sourceAnalysis.movements.map((m) => (m.reps ? { ...m, reps: 100 } : m))],
    [
      'unknown explicit reps',
      sourceAnalysis.movements.map((m) => (m.reps ? { ...m, reps: null } : m)),
    ],
    [
      'changed distance',
      sourceAnalysis.movements.map((m) => (m.distanceMeters ? { ...m, distanceMeters: 40 } : m)),
    ],
    [
      'changed calories',
      sourceAnalysis.movements.map((m) => (m.calories ? { ...m, calories: 200 } : m)),
    ],
    [
      'changed unit',
      sourceAnalysis.movements.map((m) =>
        m.calories ? { name: m.name, category: m.category, reps: 20 } : m,
      ),
    ],
  ])('rejects %s even with internally coherent JSON', async (_name, movements) => {
    const send = vi
      .fn()
      .mockResolvedValue({ text: JSON.stringify({ ...sourceAnalysis, movements }) });
    await expect(analyzeWod({ rawText }, send)).rejects.toBeInstanceOf(WodAnalysisError);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('retries a source mismatch and returns the corrected result', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        text: JSON.stringify({ ...sourceAnalysis, movements: sourceAnalysis.movements.slice(1) }),
      })
      .mockResolvedValueOnce({ text: JSON.stringify(sourceAnalysis) });
    expect(await analyzeWod({ rawText }, send)).toEqual(sourceAnalysis);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it.each(['For Time', 'Chipper', 'AMRAP 12 min'])(
    'accepts plural names in %s',
    async (heading) => {
      const expected = {
        ...sourceAnalysis,
        format: heading.startsWith('AMRAP')
          ? 'AMRAP'
          : heading === 'Chipper'
            ? 'CHIPPER'
            : 'FOR_TIME',
        durationMinutes: heading.startsWith('AMRAP') ? 12 : null,
      };
      const send = vi.fn().mockResolvedValue({ text: JSON.stringify(expected) });
      await expect(
        analyzeWod({ rawText: rawText.replace('For Time', heading) }, send),
      ).resolves.toEqual(expected);
      expect(send).toHaveBeenCalledTimes(1);
    },
  );

  it('does not let extracted text override the original text', async () => {
    const output = {
      ...sourceAnalysis,
      extractedText: 'For Time\n10 Burpees\n40m Run\n20 cal Row',
      movements: sourceAnalysis.movements.map((m) =>
        m.distanceMeters ? { ...m, distanceMeters: 40 } : m,
      ),
    };
    const send = vi.fn().mockResolvedValue({ text: JSON.stringify(output) });
    await expect(
      analyzeWod({ rawText, imageBase64: 'test', imageMimeType: 'image/png' }, send),
    ).rejects.toBeInstanceOf(WodAnalysisError);
  });

  it('checks an image transcription without claiming OCR fidelity', async () => {
    const output = {
      ...sourceAnalysis,
      extractedText: rawText,
      movements: sourceAnalysis.movements.slice(1),
    };
    const send = vi.fn().mockResolvedValue({ text: JSON.stringify(output) });
    await expect(
      analyzeWod({ imageBase64: 'test', imageMimeType: 'image/png' }, send),
    ).rejects.toBeInstanceOf(WodAnalysisError);
  });

  it('accepts explicit aliases without changing the returned names', async () => {
    const output = {
      ...sourceAnalysis,
      movements: [
        { name: 'Toes-to-Bar', category: 'gymnastics', reps: 10 },
        { name: 'Handstand Walk', category: 'gymnastics', distanceMeters: 20 },
      ],
    };
    const send = vi.fn().mockResolvedValue({ text: JSON.stringify(output) });
    await expect(analyzeWod({ rawText: 'For Time\n10 T2B\n20m HSW' }, send)).resolves.toEqual(
      output,
    );
  });

  it.each([
    'For Time\n10 Burpee\n400m Run\n20 cal Row\nNota: ajustar conforme o coach',
    'For Time\n10 Burpee 20kg\n400m Run\n20 cal Row',
    'For Time\n21-15-9 Burpee',
    'For Time\n10 Burpee\n10 Burpee',
    'For Time\n10 Movimento desconhecido',
    'For Time\n10 Row',
  ])('does not partially interpret unsupported source syntax: %s', async (source) => {
    const send = vi.fn().mockResolvedValue({ text: JSON.stringify(sourceAnalysis) });
    await expect(analyzeWod({ rawText: source }, send)).resolves.toEqual(sourceAnalysis);
  });
});
