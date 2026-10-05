import { describe, it, expect, vi } from 'vitest';
import { analyzeWod, WodAnalysisError, type SendMessage } from '@wod-coach-ai/coach-engine';
function textMessage(text: string) {
  return { text };
}

const VALID_OUTPUT = {
  format: 'AMRAP',
  durationMinutes: 15,
  stimulus: 'mixed_modal',
  movements: [
    { name: 'Toes to Bar', category: 'gymnastics', reps: 10 },
    { name: 'Wall Ball', category: 'conditioning', reps: 15 },
    { name: 'Run', category: 'monostructural', distanceMeters: 200 },
  ],
  estimatedDemand: { engine: 8, grip: 7, legs: 7, gymnastics: 6, technical: 5 },
  estimatedIntensity: 8,
  confidence: 0.9,
  warnings: [],
};

describe('analyzeWod', () => {
  it('requires labels for explicit buy-in/out even when enough execution blocks were returned', async () => {
    const rounds = Array.from({ length: 5 }, (_, index) => ({
      roundNumber: index + 1,
      movements: VALID_OUTPUT.movements,
    }));
    const sendMessage: SendMessage = vi
      .fn()
      .mockResolvedValue(textMessage(JSON.stringify({ ...VALID_OUTPUT, rounds })));
    await expect(
      analyzeWod(
        { rawText: 'Buy-in: 25 thrusters; 3 rounds de 10 T2B; Buy-out: 25 thrusters' },
        sendMessage,
      ),
    ).rejects.toBeInstanceOf(WodAnalysisError);
  });

  it('validates reconstructed movements instead of returning fractional reps', async () => {
    const sendMessage: SendMessage = vi.fn().mockResolvedValue(
      textMessage(
        JSON.stringify({
          ...VALID_OUTPUT,
          movements: [{ name: 'Toes to Bar', category: 'gymnastics', reps: 6 }],
          rounds: null,
        }),
      ),
    );
    await expect(analyzeWod({ rawText: '5 rounds\n1.2 T2B' }, sendMessage)).rejects.toBeInstanceOf(
      WodAnalysisError,
    );
  });

  it.each(['5 rds', '5 rodadas', '2 rounds: 10 T2B; 3 rounds: 10 T2B', '21 rounds: 10 T2B'])(
    'does not silently drop explicit rounds in %s',
    async (rawText) => {
      const sendMessage: SendMessage = vi
        .fn()
        .mockResolvedValue(textMessage(JSON.stringify({ ...VALID_OUTPUT, rounds: null })));
      await expect(analyzeWod({ rawText }, sendMessage)).rejects.toBeInstanceOf(WodAnalysisError);
    },
  );

  it('does not count AMRAP goals as fixed rounds', async () => {
    const sendMessage: SendMessage = vi
      .fn()
      .mockResolvedValue(textMessage(JSON.stringify(VALID_OUTPUT)));
    const result = await analyzeWod(
      { rawText: 'AMRAP 15: 10 T2B + 15 Wall Ball + 200m Run. Meta: 8 rounds' },
      sendMessage,
    );
    expect(result.rounds).toBeUndefined();
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('does not double-count repeated raw and extracted text', async () => {
    const text = '3 rounds de 10 T2B';
    const rounds = Array.from({ length: 3 }, (_, index) => ({
      roundNumber: index + 1,
      movements: VALID_OUTPUT.movements,
    }));
    const sendMessage: SendMessage = vi.fn().mockResolvedValue(
      textMessage(
        JSON.stringify({
          ...VALID_OUTPUT,
          extractedText: text,
          movements: VALID_OUTPUT.movements.map((movement) => ({
            ...movement,
            ...(movement.reps != null ? { reps: movement.reps * 3 } : {}),
            ...(movement.distanceMeters != null
              ? { distanceMeters: movement.distanceMeters * 3 }
              : {}),
          })),
          rounds,
        }),
      ),
    );
    expect((await analyzeWod({ rawText: text }, sendMessage)).rounds).toEqual(rounds);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate or out-of-order round numbers', async () => {
    const rounds = [1, 1, 3].map((roundNumber) => ({
      roundNumber,
      movements: VALID_OUTPUT.movements,
    }));
    const sendMessage: SendMessage = vi
      .fn()
      .mockResolvedValue(textMessage(JSON.stringify({ ...VALID_OUTPUT, rounds })));
    await expect(analyzeWod({ rawText: '3 rounds de 10 T2B' }, sendMessage)).rejects.toBeInstanceOf(
      WodAnalysisError,
    );
  });

  it.each([undefined, null, [], [{ roundNumber: 1, movements: VALID_OUTPUT.movements }]])(
    'rejects missing or partial rounds for an explicit fixed-round WOD: %j',
    async (rounds) => {
      const sendMessage: SendMessage = vi.fn().mockResolvedValue(
        textMessage(
          JSON.stringify({
            ...VALID_OUTPUT,
            format: 'ROUNDS_FOR_TIME',
            rounds,
          }),
        ),
      );
      await expect(
        analyzeWod({ rawText: '5 rounds de 10 T2B + 15 Wall Ball + 200m Run' }, sendMessage),
      ).rejects.toBeInstanceOf(WodAnalysisError);
      expect(sendMessage).toHaveBeenCalledTimes(2);
    },
  );

  it('retries aggregated rounds and returns the complete structure with variable reps and loads', async () => {
    const rounds = [30, 20, 10].map((reps, index) => ({
      roundNumber: index + 1,
      movements: [
        {
          name: 'Thruster',
          category: 'weightlifting',
          reps,
          loadDescription: `${40 + index * 10}kg`,
        },
      ],
    }));
    const output = {
      ...VALID_OUTPUT,
      format: 'ROUNDS_FOR_TIME',
      movements: [
        { name: 'Thruster', category: 'weightlifting', reps: 60, loadDescription: '40/50/60kg' },
      ],
    };
    const sendMessage: SendMessage = vi
      .fn()
      .mockResolvedValueOnce(textMessage(JSON.stringify({ ...output, rounds: null })))
      .mockResolvedValueOnce(textMessage(JSON.stringify({ ...output, rounds })));
    const result = await analyzeWod(
      { rawText: '3 rounds: Thrusters 30-20-10 reps, cargas 40/50/60kg' },
      sendMessage,
    );
    expect(result.rounds).toEqual(rounds);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('requires fixed rounds from the extracted image text', async () => {
    const sendMessage: SendMessage = vi.fn().mockResolvedValue(
      textMessage(
        JSON.stringify({
          ...VALID_OUTPUT,
          extractedText: '5 rounds de 10 T2B + 15 Wall Ball + 200m Run',
          rounds: null,
        }),
      ),
    );
    await expect(
      analyzeWod({ imageBase64: 'abc', imageMimeType: 'image/png' }, sendMessage),
    ).rejects.toBeInstanceOf(WodAnalysisError);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('rejects buy-in/out collapsed into the declared round count', async () => {
    const sendMessage: SendMessage = vi.fn().mockResolvedValue(
      textMessage(
        JSON.stringify({
          ...VALID_OUTPUT,
          rounds: Array.from({ length: 3 }, (_, index) => ({
            roundNumber: index + 1,
            movements: VALID_OUTPUT.movements,
          })),
        }),
      ),
    );
    await expect(
      analyzeWod(
        { rawText: 'Buy-in: 25 thrusters; 3 rounds de 10 T2B; Buy-out: 25 thrusters' },
        sendMessage,
      ),
    ).rejects.toBeInstanceOf(WodAnalysisError);
  });

  it('parses and validates a well-formed JSON response on the first attempt', async () => {
    const sendMessage: SendMessage = vi
      .fn()
      .mockResolvedValue(textMessage(JSON.stringify(VALID_OUTPUT)));

    const result = await analyzeWod({ rawText: '15 min AMRAP...' }, sendMessage);

    expect(result.format).toBe('AMRAP');
    expect(result.movements).toHaveLength(3);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('strips markdown code fences before parsing', async () => {
    const fenced = '```json\n' + JSON.stringify(VALID_OUTPUT) + '\n```';
    const sendMessage: SendMessage = vi.fn().mockResolvedValue(textMessage(fenced));

    const result = await analyzeWod({ rawText: '15 min AMRAP...' }, sendMessage);

    expect(result.confidence).toBe(0.9);
  });

  it('retries once when the first response is not valid JSON, then succeeds', async () => {
    const sendMessage: SendMessage = vi
      .fn()
      .mockResolvedValueOnce(textMessage('not json at all'))
      .mockResolvedValueOnce(textMessage(JSON.stringify(VALID_OUTPUT)));

    const result = await analyzeWod({ rawText: '15 min AMRAP...' }, sendMessage);

    expect(result.format).toBe('AMRAP');
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('reconstructs explicit uniform rounds when the model returns only aggregated totals', async () => {
    const aggregatedRoundsOutput = {
      ...VALID_OUTPUT,
      extractedText: '5 Rounds\n16m farm hold double db lunge\n16 T2B\n8m Handstand Walk',
      format: 'ROUNDS_FOR_TIME',
      durationMinutes: null,
      stimulus: 'engine + grip',
      movements: [
        {
          name: 'farm hold double db lunge',
          category: 'weightlifting',
          distanceMeters: 80,
        },
        { name: 'toes to bar', category: 'gymnastics', reps: 80 },
        { name: 'handstand walk', category: 'gymnastics', distanceMeters: 40 },
      ],
      rounds: null,
    };
    const sendMessage: SendMessage = vi
      .fn()
      .mockResolvedValue(textMessage(JSON.stringify(aggregatedRoundsOutput)));

    const result = await analyzeWod(
      { rawText: null, imageBase64: 'abc', imageMimeType: 'image/png' },
      sendMessage,
    );

    expect(result.rounds).toHaveLength(5);
    expect(result.rounds?.[0]?.movements).toEqual([
      expect.objectContaining({ name: 'farm hold double db lunge', distanceMeters: 16 }),
      expect.objectContaining({ name: 'toes to bar', reps: 16 }),
      expect.objectContaining({ name: 'handstand walk', distanceMeters: 8 }),
    ]);
    expect(result.movements).toEqual(aggregatedRoundsOutput.movements);
  });

  it('throws WodAnalysisError without ever returning invalid data after exhausting retries', async () => {
    const sendMessage: SendMessage = vi.fn().mockResolvedValue(textMessage('still not json'));

    await expect(analyzeWod({ rawText: '15 min AMRAP...' }, sendMessage)).rejects.toBeInstanceOf(
      WodAnalysisError,
    );
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('rejects a response that fails schema validation (e.g. demand out of range)', async () => {
    const invalid = {
      ...VALID_OUTPUT,
      estimatedDemand: { ...VALID_OUTPUT.estimatedDemand, engine: 99 },
    };
    const sendMessage: SendMessage = vi
      .fn()
      .mockResolvedValue(textMessage(JSON.stringify(invalid)));

    await expect(analyzeWod({ rawText: '15 min AMRAP...' }, sendMessage)).rejects.toBeInstanceOf(
      WodAnalysisError,
    );
  });

  it('throws before calling the API when neither text nor image is provided', async () => {
    const sendMessage: SendMessage = vi.fn();

    await expect(analyzeWod({}, sendMessage)).rejects.toBeInstanceOf(WodAnalysisError);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
