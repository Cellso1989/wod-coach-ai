import { describe, expect, it } from 'vitest';
import { wodWarningAction } from '@wod-coach-ai/types';
import { wodAnalysisUpdateSchema } from '@wod-coach-ai/validation';

export const interpretationWarnings = [
  "Interpretei 'STOH' como Shoulder to Overhead. Confirme se essa é a intenção.",
  'Entendi o treino como 3 blocos for time (sequência repetida 3 vezes). Confirme se esse é o formato correto.',
];

describe('WOD review actions', () => {
  it.each(interpretationWarnings)('requires review for %s', (warning) => {
    expect(wodWarningAction(warning)).toBe('interpretation');
  });
  it.each([
    ['Format assumed as ROUNDS_FOR_TIME', 'interpretation'],
    [
      'Falta informar o tempo do treino ou o tempo limite para terminar. A análise continua sem essa informação.',
      'duration',
    ],
    ['Tempo ou time cap nao informado.', 'duration'],
    [
      "A imagem mostra '60/40 50/35 30/25' mas foi fornecido '60kg' no texto; confirme as cargas de cada variação.",
      'loads',
    ],
    ['Carga nao informada para Wall Ball; confirme antes de executar.', 'loads'],
    ['Não foi informado o tempo de descanso entre os sets.', 'source'],
    ['A meta de tempo nao foi informada.', 'source'],
    ['Preserve a tecnica e nao execute com dor.', 'source'],
  ])('routes %s to %s', (warning, action) => expect(wodWarningAction(warning)).toBe(action));
  it('requires an explicit version and nonempty unique confirmations', () => {
    for (const input of [
      { confirmedWarnings: interpretationWarnings },
      { versionId: 'v1', confirmedWarnings: [] },
      {
        versionId: 'v1',
        confirmedWarnings: [interpretationWarnings[0], interpretationWarnings[0]],
      },
    ])
      expect(wodAnalysisUpdateSchema.safeParse(input).success).toBe(false);
    expect(
      wodAnalysisUpdateSchema.safeParse({
        versionId: 'v1',
        confirmedWarnings: interpretationWarnings,
      }).success,
    ).toBe(true);
  });
});
