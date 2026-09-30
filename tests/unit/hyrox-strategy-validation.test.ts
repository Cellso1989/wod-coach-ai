import { describe, expect, it } from 'vitest';
import { hyroxStrategyInputSchema, hyroxStrategyOutputSchema } from '@wod-coach-ai/validation';

describe('hyrox strategy validation', () => {
  it('accepts a free-form box workout and compact AI strategy output', () => {
    const input = hyroxStrategyInputSchema.parse({
      rawWorkout: '5 rounds for time: 800m run, 500m row, 20 sandbag lunges, 20 wall balls',
      division: 'DOUBLES',
      experience: 'competitive',
      targetTimeMinutes: 42,
      strengths: ['Row', 'corrida'],
      limiters: ['Wall Balls'],
    });

    expect(input.rawWorkout).toContain('5 rounds');
    expect(input.strengths).toHaveLength(2);

    const output = hyroxStrategyOutputSchema.parse({
      workoutSummary: '5 rounds com corrida, row, lunges e wall balls.',
      target: 'Finalizar perto de 42 min.',
      runPace: '800m em ritmo controlado, sem sprint nos 2 primeiros rounds.',
      pacing: 'Crescer do round 3 em diante.',
      blockPlan: [
        { block: '800m run', focus: 'Controle', execution: 'Ritmo sustentavel desde o inicio.' },
        { block: 'Wall balls', focus: 'Sets', execution: 'Quebre antes da falha.' },
      ],
      breakStrategy: [{ movement: 'Wall balls', strategy: '12/8 em todos os rounds.' }],
      transitionStrategy: 'Transicoes curtas, sem descanso parado.',
      criticalRisk: 'Perder perna nos lunges antes dos wall balls.',
      finalPush: 'Acelerar so no ultimo bloco de corrida.',
      warnings: [],
      confidence: 0.8,
    });

    expect(output.blockPlan).toHaveLength(2);
  });

  it('rejects missing workout text', () => {
    expect(() =>
      hyroxStrategyInputSchema.parse({
        rawWorkout: 'short',
        division: 'OPEN_MEN',
        experience: 'first_timer',
      }),
    ).toThrow();
  });
});
