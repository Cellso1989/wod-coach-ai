import { describe, expect, it, vi } from 'vitest';
import { analyzeWod, WodAnalysisError } from '@wod-coach-ai/coach-engine';
import { ladderAnalysis } from '../fixtures/wod-ladder-case.js';

const burpee = { name: 'Burpees', category: 'conditioning', reps: 10 };
const roundAnalysis = {
  ...ladderAnalysis,
  format: 'ROUNDS_FOR_TIME',
  durationMinutes: null,
  movements: [{ ...burpee, reps: 20 }],
  rounds: [1, 2].map((roundNumber) => ({ roundNumber, movements: [burpee] })),
};
const sendOutput = (output: unknown) => vi.fn().mockResolvedValue({ text: JSON.stringify(output) });

describe('CrossFit terminology in WOD reading', () => {
  it('sends the glossary to the reading agent and preserves fixed RFT rounds', async () => {
    const send = sendOutput(roundAnalysis);
    const output = await analyzeWod({ rawText: 'RFT\n2 rounds\n10 Burpees' }, send);
    expect(output.format).toBe('ROUNDS_FOR_TIME');
    expect(output.rounds).toEqual(roundAnalysis.rounds);
    expect(send.mock.calls[0][0].systemPrompt).toContain('No Rep:');
    expect(send.mock.calls[0][0].systemPrompt).toContain('Scaled:');
  });
  it.each([
    ['RFT\n2 rounds\n10 Burpees', { ...roundAnalysis, format: 'AMRAP' }],
    ['Tabata\nBurpees', { ...roundAnalysis, format: 'EMOM' }],
  ])('rejects incompatible formats for %s', async (rawText, output) => {
    const send = sendOutput(output);
    await expect(analyzeWod({ rawText }, send)).rejects.toBeInstanceOf(WodAnalysisError);
    expect(send).toHaveBeenCalledTimes(2);
  });
  it('represents Tabata as INTERVAL without inventing repetition counts', async () => {
    const output = await analyzeWod(
      { rawText: 'Tabata\nBurpees' },
      sendOutput({
        ...roundAnalysis,
        format: 'INTERVAL',
        movements: [{ ...burpee, reps: null }],
        rounds: null,
      }),
    );
    expect(output.format).toBe('INTERVAL');
    expect(output.movements[0].reps).toBeNull();
  });
  it('requires Cash-out as a separate final block, including for image transcription', async () => {
    const source = '2 rounds\n10 Burpees\nCash-out\n10 Burpees';
    const valid = {
      ...roundAnalysis,
      movements: [{ ...burpee, reps: 30 }],
      rounds: [...roundAnalysis.rounds, { roundNumber: 3, label: 'Cash-out', movements: [burpee] }],
    };
    for (const image of [false, true]) {
      const input = image
        ? { imageBase64: 'fixture', imageMimeType: 'image/png' }
        : { rawText: source };
      const result = await analyzeWod(
        input,
        sendOutput({ ...valid, extractedText: image ? source : null }),
      );
      expect(result.rounds).toEqual(valid.rounds);
      await expect(
        analyzeWod(
          input,
          sendOutput({
            ...valid,
            extractedText: image ? source : null,
            rounds: valid.rounds.map(({ label: _label, ...round }) => round),
          }),
        ),
      ).rejects.toBeInstanceOf(WodAnalysisError);
    }
  });
});
