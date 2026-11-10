import { describe, expect, it } from 'vitest';
import { formatWodAnalysisWarnings } from '../../apps/web/src/lib/wod-analysis-warnings.js';

describe('athlete-facing WOD warnings', () => {
  it('places interpretations first while preserving order and deduplication within each group', () => {
    const first = 'Interpretei Anmrap como um bloco de tres minutos. Confirme o formato.';
    const second = 'Interpretei 4 sets como quatro blocos. Confirme a leitura.';
    const load = 'Falta informar a carga de Wall Ball. Preencha em Editar cargas.';
    const rest = 'Não foi informado o tempo de descanso entre os 4 sets.';
    const warnings = [load, first, rest, second, first];
    const original = [...warnings];
    expect(formatWodAnalysisWarnings(warnings)).toEqual([first, second, load, rest]);
    expect(warnings).toEqual(original);
  });
  it.each(['Interpretei', 'interpretei', 'INTERPRETEI'])(
    'prioritizes %s after trimming whitespace',
    (word) => {
      const interpretation = `${word} como quatro blocos. Confirme a leitura.`;
      expect(
        formatWodAnalysisWarnings(['Descanso não informado.', `  ${interpretation}  `]),
      ).toEqual([interpretation, 'Descanso não informado.']);
    },
  );
  it.each(['de', 'do', 'da', 'para'])(
    'deduplicates missing load notices using %s',
    (preposition) => {
      expect(
        formatWodAnalysisWarnings([
          'Carga nao informada para Dumbbell Overhead lunge; confirme antes de executar.',
          `Falta informar a carga ${preposition} Dumbbell Overhead lunge. Preencha em Editar cargas.`,
        ]),
      ).toEqual(['Falta informar a carga de Dumbbell Overhead lunge. Preencha em Editar cargas.']);
    },
  );
  it('keeps distinct lunge variations and mixed safety guidance', () => {
    const safety =
      'Falta informar a carga do Dumbbell Overhead lunge. Preencha em Editar cargas. Nao execute com dor.';
    expect(
      formatWodAnalysisWarnings([
        'Falta informar a carga do Dumbbell Overhead lunge. Preencha em Editar cargas.',
        'Falta informar a carga do Dumbbell Front Rack lunge. Preencha em Editar cargas.',
        safety,
      ]),
    ).toEqual([
      'Falta informar a carga de Dumbbell Overhead lunge. Preencha em Editar cargas.',
      'Falta informar a carga de Dumbbell Front Rack lunge. Preencha em Editar cargas.',
      safety,
    ]);
  });
  it('deduplicates the screenshot notices despite Dumbell/Dumbbell spelling', () => {
    const interpretation =
      "Interpretei 'Anmrap' como o maximo de voltas ou repeticoes dentro do tempo definido de 3 minutos por set. Confirme se esta correto.";
    const rest = 'Não foi informado o tempo de descanso entre os 4 sets.';
    const warnings = [
      'Falta informar a carga de Dumbell Overhead lunge. Preencha em Editar cargas.',
      interpretation,
      'Falta informar a carga do Wall Ball. Preencha em Editar cargas.',
      'Falta informar a carga do Dumbbell Overhead lunge. Preencha em Editar cargas.',
      rest,
    ];
    expect(formatWodAnalysisWarnings(warnings)).toEqual([
      interpretation,
      'Falta informar a carga de Dumbbell Overhead lunge. Preencha em Editar cargas.',
      'Falta informar a carga de Wall Ball. Preencha em Editar cargas.',
      rest,
    ]);
    expect(warnings).toHaveLength(5);
  });
  it('shows one notice per movement for grouped, translated and saved load warnings', () => {
    expect(
      formatWodAnalysisWarnings([
        'Carga nao informada para Wall Ball, Dumbbell Overhead lunge; confirme antes de executar.',
        'Falta informar a carga de Dumbbell Overhead lunge. Preencha em Editar cargas.',
        'load not specified for dumbbell overhead Lunge',
        'Carga não informada para WALL BALL; confirme antes de executar.',
        'Falta informar a carga para Dumbbell Overhead lunge. Preencha em Editar cargas!',
        'Nao aumente a carga se houver dor.',
      ]),
    ).toEqual([
      'Falta informar a carga de Wall Ball. Preencha em Editar cargas.',
      'Falta informar a carga de Dumbbell Overhead lunge. Preencha em Editar cargas.',
      'Nao aumente a carga se houver dor.',
    ]);
  });
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
