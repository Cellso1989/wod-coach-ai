import { describe, expect, it, vi } from 'vitest';
import { analyzeWod, WodAnalysisError } from '@wod-coach-ai/coach-engine';
import { ladderAnalysis, ladderSource } from '../fixtures/wod-ladder-case.js';

describe('source format and time cap integrity', () => {
  it('does not let an inferred image heading override explicit athlete context', async () => {
    const send = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        ...ladderAnalysis,
        format: 'AMRAP',
        extractedText: `AMRAP 12 min\n${ladderSource}`,
      }),
    });
    await expect(
      analyzeWod(
        {
          rawText: 'For Time\nTime cap: 12 min',
          imageBase64: 'fixture',
          imageMimeType: 'image/png',
        },
        send,
      ),
    ).rejects.toBeInstanceOf(WodAnalysisError);
  });
  it('does not impose a single format or phase cap on explicitly mixed blocks', async () => {
    const output = { ...ladderAnalysis, format: 'INTERVAL', durationMinutes: null };
    const send = vi.fn().mockResolvedValue({ text: JSON.stringify(output) });
    expect(
      await analyzeWod(
        { rawText: 'For Time\n10 Burpees\nTime cap: 3 min\nAMRAP 5 min\n5 Pull-ups' },
        send,
      ),
    ).toEqual({ ...output, warnings: expect.any(Array) });
  });
  it('correctively retries a finite image ladder interpreted as AMRAP from Tempo', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        text: JSON.stringify({ ...ladderAnalysis, extractedText: ladderSource, format: 'AMRAP' }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({ ...ladderAnalysis, extractedText: ladderSource }),
      });
    const output = await analyzeWod(
      { rawText: 'Tempo 12 min', imageBase64: 'fixture', imageMimeType: 'image/png' },
      send,
    );
    expect(output.format).toBe('FOR_TIME');
    expect(output.rounds!.map((r) => r.movements.map((m) => m.reps))).toEqual([
      [21, 21, 12],
      [15, 15, 10],
      [9, 9, 8],
    ]);
    expect(send).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(send.mock.calls[1])).toContain('Tempo isolado');
  });
  it('rejects AMRAP on every attempt without changing the finite prescription', async () => {
    const send = vi
      .fn()
      .mockResolvedValue({ text: JSON.stringify({ ...ladderAnalysis, format: 'AMRAP' }) });
    await expect(
      analyzeWod({ rawText: `${ladderSource}\nTempo 12 min` }, send),
    ).rejects.toBeInstanceOf(WodAnalysisError);
    expect(send).toHaveBeenCalledTimes(2);
  });
  it('allows explicit AMRAP rather than imposing For Time on every ladder', async () => {
    const output = { ...ladderAnalysis, format: 'AMRAP' };
    const send = vi.fn().mockResolvedValue({ text: JSON.stringify(output) });
    expect((await analyzeWod({ rawText: `AMRAP 12 min\n${ladderSource}` }, send)).format).toBe(
      'AMRAP',
    );
  });
  it('keeps ambiguous finite format null with a warning', async () => {
    const output = {
      ...ladderAnalysis,
      format: null,
      warnings: ['Confirme se o treino e For Time.'],
    };
    expect(
      await analyzeWod(
        { rawText: ladderSource },
        vi.fn().mockResolvedValue({ text: JSON.stringify(output) }),
      ),
    ).toEqual({
      ...output,
      durationMinutes: null,
      warnings: expect.arrayContaining(output.warnings),
    });
  });
  it.each([
    { format: 'AMRAP', durationMinutes: 12 },
    { format: 'FOR_TIME', durationMinutes: 15 },
  ])('rejects an explicit For Time cap conflict: %j', async (fault) => {
    const send = vi
      .fn()
      .mockResolvedValue({ text: JSON.stringify({ ...ladderAnalysis, ...fault }) });
    await expect(
      analyzeWod({ rawText: `For Time\nTime cap: 12 min\n${ladderSource}` }, send),
    ).rejects.toBeInstanceOf(WodAnalysisError);
  });
});
