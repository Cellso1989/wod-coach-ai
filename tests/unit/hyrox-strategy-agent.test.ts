import { describe, expect, it, vi } from 'vitest';
import {
  generateHyroxStrategy,
  HyroxStrategyGenerationError,
  type SendMessage,
} from '@wod-coach-ai/coach-engine';

function textMessage(text: string) {
  return { text };
}

const VALID_HYROX_STRATEGY = {
  workoutSummary: '4 rounds: run, SkiErg, sled push e wall balls.',
  target: 'Terminar entre 32-35 min.',
  runPace: 'Corridas em 5:35-5:45/km; nao acelerar antes do round 4.',
  pacing: 'Round 1 controlado, rounds 2-3 constantes, round 4 ataque progressivo.',
  blockPlan: [
    {
      block: 'Corrida 1 km por round',
      focus: 'Controle inicial',
      execution: 'Segure 10s/km acima do pace alvo no round 1.',
    },
    {
      block: '500m SkiErg',
      focus: 'Respiracao',
      execution: 'Stroke longo e sem sprint. Saia pronto para empurrar o sled.',
    },
  ],
  breakStrategy: [{ movement: 'Wall balls', strategy: 'Quebre 15/10 desde o round 1.' }],
  transitionStrategy: 'Entre na estacao ja sabendo a primeira acao; saia trotando.',
  criticalRisk: 'Sled push pode quebrar a corrida seguinte.',
  finalPush: 'No ultimo round, acelere depois do sled e feche wall balls sem pausa longa.',
  warnings: [],
  confidence: 0.84,
};

describe('generateHyroxStrategy', () => {
  it('asks the AI for a strategy for the workout defined by the box', async () => {
    const sendMessage: SendMessage = vi
      .fn()
      .mockResolvedValue(textMessage(JSON.stringify(VALID_HYROX_STRATEGY)));

    const result = await generateHyroxStrategy(
      {
        rawWorkout: '4 rounds for time: 1 km run, 500m SkiErg, 20m sled push, 25 wall balls',
        division: 'OPEN_MEN',
        experience: 'returning',
        runPaceSecondsPerKm: 330,
        strengths: ['SkiErg'],
        limiters: ['sled push'],
      },
      sendMessage,
    );

    expect(result.blockPlan[0]?.block).toContain('Corrida');
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const params = vi.mocked(sendMessage).mock.calls[0]?.[0];
    expect(params?.model).toBe('gpt-5-mini');
    expect(params?.systemPrompt).toContain('treino estilo HYROX hoje');
    expect(params?.messages[0]?.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('4 rounds for time'),
    });
  });

  it('throws HyroxStrategyGenerationError after invalid AI JSON', async () => {
    const sendMessage: SendMessage = vi.fn().mockResolvedValue(textMessage('not json'));

    await expect(
      generateHyroxStrategy(
        {
          rawWorkout: 'AMRAP 30: 800m run, 1000m row, 40 lunges, 30 wall balls',
          division: 'OPEN_WOMEN',
          experience: 'first_timer',
        },
        sendMessage,
      ),
    ).rejects.toBeInstanceOf(HyroxStrategyGenerationError);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });
});
