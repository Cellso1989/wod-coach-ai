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
      const send = vi
        .fn()
        .mockResolvedValue({
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
    const send = vi
      .fn()
      .mockResolvedValue({
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
