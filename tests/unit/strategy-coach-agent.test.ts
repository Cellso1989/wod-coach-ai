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
