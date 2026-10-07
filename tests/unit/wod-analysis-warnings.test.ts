import { describe, expect, it } from 'vitest';
import { formatWodAnalysisWarnings } from '../../apps/web/src/lib/wod-analysis-warnings.js';

describe('athlete-facing WOD warnings', () => {
  it('explains the screenshot warnings in Portuguese without changing stored text', () => {
    const warnings = [
      "format assumed ROUNDS_FOR_TIME based on '5 rounds' (not explicitly stated as for time)",
      'load not specified for Hang power clean',
    ];
    const original = [...warnings];
    expect(formatWodAnalysisWarnings(warnings)).toEqual([
      'Entendi o treino como 5 voltas para terminar no menor tempo possivel. Confirme se esse e o formato correto.',
      'Falta informar a carga de Hang power clean. Preencha em Editar cargas.',
    ]);
    expect(warnings).toEqual(original);
  });
  it('preserves Portuguese safety advice and removes internal format codes', () => {
    expect(
      formatWodAnalysisWarnings([
        'Nao aumente a carga se houver dor.',
        'Formato presumido como ROUNDS_FOR_TIME pois nao especifica tempo',
        'Time cap nao informado; Target e uma meta, nao o limite maximo.',
      ]),
    ).toEqual([
      'Nao aumente a carga se houver dor.',
      'Entendi o formato como voltas para completar no menor tempo possivel. Confirme se essa leitura esta correta.',
      'Falta informar o tempo limite para terminar. A meta de tempo nao substitui esse limite.',
    ]);
  });
  it('keeps unknown English uncertainty visible without guessing its meaning', () => {
    expect(formatWodAnalysisWarnings(['equipment unclear; check available setup'])).toEqual([
      'Ha uma observacao da analise que precisa ser conferida. Revise a foto ou o texto antes de gerar a estrategia.',
    ]);
  });
  it('deduplicates the automatic missing-load notice and the English AI notice', () => {
    expect(
      formatWodAnalysisWarnings([
        'Carga nao informada para Hang power clean; confirme antes de executar.',
        'load not specified for Hang power clean',
      ]),
    ).toEqual(['Falta informar a carga de Hang power clean. Preencha em Editar cargas.']);
  });
  it.each([
    'load not specified for Thrusters',
    'weight not provided for Thrusters.',
    'missing load for Thrusters',
  ])('translates %s and deduplicates notices', (warning) => {
    expect(formatWodAnalysisWarnings([warning, warning])).toEqual([
      'Falta informar a carga de Thrusters. Preencha em Editar cargas.',
    ]);
  });
  it('distinguishes missing limit and target and keeps the warning count', () => {
    expect(
      formatWodAnalysisWarnings(['time cap not specified', 'target not provided']),
    ).toHaveLength(2);
    expect(formatWodAnalysisWarnings(['time cap not specified']).join('')).toContain(
      'tempo limite',
    );
    expect(formatWodAnalysisWarnings(['target not provided']).join('')).toContain('meta de tempo');
  });
});
