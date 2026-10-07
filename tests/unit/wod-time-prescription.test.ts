import { describe, expect, it, vi } from 'vitest';
import { analyzeWod, WodAnalysisError } from '@wod-coach-ai/coach-engine';
import { ladderAnalysis, ladderSource } from '../fixtures/wod-ladder-case.js';

const sendOutput = (output: unknown) => vi.fn().mockResolvedValue({ text: JSON.stringify(output) });

describe('optional WOD timing and loads', () => {
  it.each(["'", '’', '′', ' min', ' minutos'])(
    'separates Target 10 and cap 15 in text and image transcription (%s)',
    async (unit) => {
      const source = `${ladderSource}\nTarget 10${unit}\nTime cap 15${unit}`;
      for (const image of [false, true]) {
        const output = await analyzeWod(
          image ? { imageBase64: 'fixture', imageMimeType: 'image/png' } : { rawText: source },
          sendOutput({
            ...ladderAnalysis,
            durationMinutes: 15,
            extractedText: image ? source : null,
          }),
        );
        expect(output.targetMinutes).toBe(10);
        expect(output.durationMinutes).toBe(15);
        expect(output.rounds).toEqual(ladderAnalysis.rounds);
      }
    },
  );
  it('continues without optional duration or load fields and warns instead of inventing', async () => {
    const { durationMinutes: _duration, ...partial } = ladderAnalysis;
    const send = sendOutput(partial);
    const output = await analyzeWod({ rawText: ladderSource }, send);
    expect(output.durationMinutes).toBeNull();
    expect(output.warnings.join(' ')).toMatch(/Tempo ou time cap nao informado/);
    expect(output.warnings.join(' ')).toMatch(/Carga nao informada para Thrusters/);
    expect(output.rounds).toEqual(ladderAnalysis.rounds);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it.each([10, 15])(
    'does not use a target alone to justify a maximum duration of %s',
    async (durationMinutes) => {
      const output = await analyzeWod(
        { rawText: `${ladderSource}\nTarget 10'` },
        sendOutput({ ...ladderAnalysis, durationMinutes }),
      );
      expect(output.targetMinutes).toBe(10);
      expect(output.durationMinutes).toBeNull();
      expect(output.warnings.join(' ')).toContain('Target e uma meta');
    },
  );
  it('does not accept a cap confused with the target', async () => {
    await expect(
      analyzeWod(
        { rawText: `${ladderSource}\nTarget 10'\nTime cap 15'` },
        sendOutput({ ...ladderAnalysis, durationMinutes: 10 }),
      ),
    ).rejects.toBeInstanceOf(WodAnalysisError);
  });
  it('gives explicit typed timing precedence over image transcription', async () => {
    const output = await analyzeWod(
      {
        rawText: 'Target 9 min\nTime cap 12 min',
        imageBase64: 'fixture',
        imageMimeType: 'image/png',
      },
      sendOutput({ ...ladderAnalysis, extractedText: `${ladderSource}\nTarget 10'\nTime cap 15'` }),
    );
    expect(output.targetMinutes).toBe(9);
    expect(output.durationMinutes).toBe(12);
  });
  it('does not warn about external loads for bodyweight movements', async () => {
    const output = await analyzeWod(
      { rawText: 'For Time\n10 Burpees' },
      sendOutput({
        ...ladderAnalysis,
        durationMinutes: null,
        rounds: null,
        movements: [{ name: 'Burpees', category: 'conditioning', reps: 10 }],
      }),
    );
    expect(output.warnings.join(' ')).not.toContain('Carga');
  });
});
