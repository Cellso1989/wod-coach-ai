import { describe, it, expect, vi } from 'vitest';
import {
  generateStrategy,
  StrategyGenerationError,
  type SendMessage,
  type StrategyCoachInput,
} from '@wod-coach-ai/coach-engine';
function textMessage(text: string) {
  return { text };
}

const VALID_STRATEGY = {
  recommendedIntensity: 8,
  targetRpe: 8,
  loadRecommendation: null,
  pacing: 'Ritmo controlado no início, acelerar nos últimos 3 minutos.',
  breakStrategy: [{ movement: 'Toes to Bar', strategy: '5 + 5 desde o início.' }],
  restStrategy: 'Descansos curtos entre rodadas.',
  movementStrategy: [{ movement: 'Wall Ball', strategy: 'Unbroken.' }],
  transitionStrategy: 'Minimizar tempo parado.',
  energyManagement: 'Controlar esforço no início.',
  goal: 'Manter consistência.',
  target: '8-9 rounds',
  criticalPoint: 'Grip',
  warnings: [],
  confidence: 0.85,
};

const MINIMAL_INPUT: StrategyCoachInput = {
  wodAnalysis: {
    format: 'AMRAP',
    durationMinutes: 15,
    stimulus: 'mixed_modal',
    movements: [{ name: 'Toes to Bar', category: 'gymnastics' }],
    estimatedDemand: { engine: 8, grip: 7, legs: 7, gymnastics: 6, technical: 5 },
    estimatedIntensity: 8,
    confidence: 0.9,
    warnings: [],
  },
  athleteContext: {
    trainingLoad: {
      last7Days: { days: 7, sessionCount: 2 },
      last14Days: { days: 14, sessionCount: 4 },
      last28Days: { days: 28, sessionCount: 8 },
    },
    similarWods: [],
    relevantPersonalRecords: [],
    dataSufficiency: 'moderate',
  },
  athleteProfile: {
    level: 'INTERMEDIATE',
    goals: ['performance'],
    injuries: [],
    limitedMovements: [],
    weeklyFrequency: 5,
  },
};

describe('generateStrategy', () => {
  it.each([
    ['no records', []],
    ['rep capacity', [{ movementName: 'Toes to Bar', value: 22, unit: 'reps' }]],
    ['time record', [{ movementName: 'Toes to Bar', value: 22, unit: 'seconds' }]],
    ['unrelated load record', [{ movementName: 'Back Squat', value: 100, unit: 'kg' }]],
    ['zero record', [{ movementName: 'Toes to Bar', value: 0, unit: 'kg' }]],
    ['unknown unit', [{ movementName: 'Toes to Bar', value: 100, unit: 'unknown' }]],
    ['nonfinite record', [{ movementName: 'Toes to Bar', value: Infinity, unit: 'kg' }]],
  ])('rejects a load recommendation with %s', async (_name, records) => {
    const sendMessage = vi.fn().mockResolvedValue(
      textMessage(
        JSON.stringify({
          ...VALID_STRATEGY,
          loadRecommendation: '60kg',
        }),
      ),
    );
    await expect(
      generateStrategy(
        {
          ...MINIMAL_INPUT,
          athleteContext: {
            ...MINIMAL_INPUT.athleteContext,
            relevantPersonalRecords: records.map((record) => ({
              ...record,
              achievedAt: new Date(),
            })),
          },
        },
        sendMessage,
      ),
    ).rejects.toBeInstanceOf(StrategyGenerationError);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('retries an unsupported load and returns only the explicit correction', async () => {
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce(
        textMessage(JSON.stringify({ ...VALID_STRATEGY, loadRecommendation: '60kg' })),
      )
      .mockResolvedValueOnce(textMessage(JSON.stringify(VALID_STRATEGY)));
    expect((await generateStrategy(MINIMAL_INPUT, sendMessage)).loadRecommendation).toBeNull();
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage.mock.calls[1][0].messages[1].content[0].text).toContain(
      'loadRecommendation',
    );
  });

  it('does not use prescribed WOD loads or free-text scores as athlete load evidence', async () => {
    const sendMessage = vi.fn().mockResolvedValue(
      textMessage(
        JSON.stringify({
          ...VALID_STRATEGY,
          loadRecommendation: '60kg',
        }),
      ),
    );
    await expect(
      generateStrategy(
        {
          ...MINIMAL_INPUT,
          wodAnalysis: {
            ...MINIMAL_INPUT.wodAnalysis,
            movements: [{ name: 'Back Squat', category: 'weightlifting', loadDescription: '60kg' }],
          },
          athleteContext: {
            ...MINIMAL_INPUT.athleteContext,
            similarWods: [
              {
                wodId: 'historical',
                date: new Date(),
                similarityScore: 1,
                analysis: {
                  format: 'STRENGTH',
                  durationMinutes: null,
                  stimulus: null,
                  movements: [{ name: 'Back Squat', category: 'weightlifting' }],
                },
                result: { score: '60kg' },
                previousStrategy: null,
              },
            ],
          },
        },
        sendMessage,
      ),
    ).rejects.toBeInstanceOf(StrategyGenerationError);
  });

  it('honors maxAttempts without silently dropping an unsupported recommendation', async () => {
    const sendMessage = vi.fn().mockResolvedValue(
      textMessage(
        JSON.stringify({
          ...VALID_STRATEGY,
          loadRecommendation: '60kg',
        }),
      ),
    );
    await expect(
      generateStrategy(MINIMAL_INPUT, sendMessage, { maxAttempts: 1 }),
    ).rejects.toBeInstanceOf(StrategyGenerationError);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it.each(['kg', 'lb', 'lbs'])(
    'preserves a load recommendation with a matching %s PR',
    async (unit) => {
      const sendMessage = vi.fn().mockResolvedValue(
        textMessage(
          JSON.stringify({
            ...VALID_STRATEGY,
            loadRecommendation: `20${unit} (PR 40${unit})`,
          }),
        ),
      );
      const result = await generateStrategy(
        {
          ...MINIMAL_INPUT,
          athleteContext: {
            ...MINIMAL_INPUT.athleteContext,
            relevantPersonalRecords: [
              {
                movementName: ' Toes-to-Bar ',
                value: 40,
                unit,
                achievedAt: new Date(),
              },
            ],
          },
        },
        sendMessage,
      );
      expect(result.loadRecommendation).toBe(`20${unit} (PR 40${unit})`);
      expect(sendMessage).toHaveBeenCalledTimes(1);
    },
  );

  it('parses and validates a well-formed strategy on the first attempt', async () => {
    const sendMessage: SendMessage = vi
      .fn()
      .mockResolvedValue(textMessage(JSON.stringify(VALID_STRATEGY)));

    const result = await generateStrategy(MINIMAL_INPUT, sendMessage);

    expect(result.recommendedIntensity).toBe(9);
    expect(result.targetRpe).toBe(10);
    expect(result.criticalPoint).toBe('Grip');
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('retries once when the first response fails validation, then succeeds', async () => {
    const invalid = { ...VALID_STRATEGY, recommendedIntensity: 99 };
    const sendMessage: SendMessage = vi
      .fn()
      .mockResolvedValueOnce(textMessage(JSON.stringify(invalid)))
      .mockResolvedValueOnce(textMessage(JSON.stringify(VALID_STRATEGY)));

    const result = await generateStrategy(MINIMAL_INPUT, sendMessage);

    expect(result.recommendedIntensity).toBe(9);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('throws StrategyGenerationError without returning invalid data after exhausting retries', async () => {
    const sendMessage: SendMessage = vi.fn().mockResolvedValue(textMessage('not json'));

    await expect(generateStrategy(MINIMAL_INPUT, sendMessage)).rejects.toBeInstanceOf(
      StrategyGenerationError,
    );
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it.each([
    { breakStrategy: [] },
    { movementStrategy: [] },
    { transitionStrategy: '   ' },
    { energyManagement: '   ' },
  ])('rejects incomplete guidance after the existing retry: %j', async (incomplete) => {
    const sendMessage: SendMessage = vi
      .fn()
      .mockResolvedValue(textMessage(JSON.stringify({ ...VALID_STRATEGY, ...incomplete })));

    await expect(generateStrategy(MINIMAL_INPUT, sendMessage)).rejects.toBeInstanceOf(
      StrategyGenerationError,
    );
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('retries an incomplete strategy and returns only the complete correction', async () => {
    const sendMessage: SendMessage = vi
      .fn()
      .mockResolvedValueOnce(textMessage(JSON.stringify({ ...VALID_STRATEGY, breakStrategy: [] })))
      .mockResolvedValueOnce(textMessage(JSON.stringify(VALID_STRATEGY)));

    const result = await generateStrategy(MINIMAL_INPUT, sendMessage);

    expect(result.breakStrategy).toEqual(VALID_STRATEGY.breakStrategy);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    const retry = vi.mocked(sendMessage).mock.calls[1][0].messages[1].content[0];
    expect(retry).toMatchObject({ type: 'text', text: expect.stringContaining('breakStrategy') });
  });

  it.each(['', '{"pacing":', '{}'])(
    'rejects empty, truncated or missing output: %j',
    async (text) => {
      const sendMessage: SendMessage = vi.fn().mockResolvedValue(textMessage(text));
      await expect(generateStrategy(MINIMAL_INPUT, sendMessage)).rejects.toBeInstanceOf(
        StrategyGenerationError,
      );
    },
  );

  it('propagates transport failure without retrying or inventing a strategy', async () => {
    const error = new Error('Transport timeout');
    const sendMessage: SendMessage = vi.fn().mockRejectedValue(error);
    await expect(generateStrategy(MINIMAL_INPUT, sendMessage)).rejects.toBe(error);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('instructs the model to attack movements when PR is clearly above round reps', async () => {
    const sendMessage: SendMessage = vi
      .fn()
      .mockResolvedValue(textMessage(JSON.stringify(VALID_STRATEGY)));

    await generateStrategy(
      {
        ...MINIMAL_INPUT,
        wodAnalysis: {
          ...MINIMAL_INPUT.wodAnalysis,
          movements: [{ name: 'Bar muscle-up', category: 'gymnastics', reps: 30 }],
          rounds: [
            {
              roundNumber: 1,
              movements: [{ name: 'Bar muscle-up', category: 'gymnastics', reps: 10 }],
            },
          ],
        },
        athleteContext: {
          ...MINIMAL_INPUT.athleteContext,
          relevantPersonalRecords: [
            {
              movementName: 'Bar muscle-up',
              value: 22,
              unit: 'reps',
              achievedAt: new Date('2026-09-01T00:00:00.000Z'),
            },
          ],
        },
      },
      sendMessage,
    );

    const params = vi.mocked(sendMessage).mock.calls[0]?.[0];
    expect(params?.systemPrompt).toContain('oportunidade de ataque');
    expect(params?.systemPrompt).toContain('buy-in + buy-out');
    expect(params?.systemPrompt).toContain('volume por round');
    expect(params?.messages[0]?.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('"movementName": "Bar muscle-up"'),
    });
  });
});
