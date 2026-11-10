import type { WodAnalysisOutput, StrategyOutput } from '@wod-coach-ai/validation';
import type { RefinementCtx } from 'zod';
import {
  readScoredIntervals,
  matchesScoredMovement,
  scoredMovementKey,
} from './scored-interval-prescription.js';
export { readScoredIntervals } from './scored-interval-prescription.js';

/** Unknown prescribed reps do not prevent summing the reps actually achieved. */
export function reconcileScoredIntervalWarnings(
  warnings: readonly string[],
  sources: readonly (string | null | undefined)[],
): string[] {
  const prescription = sources.map((source) => readScoredIntervals(source ?? '')).find(Boolean);
  if (!prescription) return [...warnings];
  return [
    ...new Set(
      warnings.map((warning) => {
        // Match only the erroneous volume notice, leaving unrelated/safety warnings intact.
        const normalized = warning
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim();
        const match = normalized.match(
          /^repeticoes\s+['"\u2018\u2019\u201c\u201d]?(?:maximo|max)['"\u2018\u2019\u201c\u201d]?\s+de\s+(.+?)\s+sao variaveis\s*;\s*(?:o\s+)?total nao pode ser somado(?:\.(?:\s+([\s\S]+))?|)$/i,
        );
        if (
          !match ||
          scoredMovementKey(match[1]!) !== scoredMovementKey(prescription.scoreMovement.name)
        )
          return warning;
        // Preserve the original suffix (including accents), e.g. advice about pain.
        const suffix = match[2] ? (warning.trim().match(/somado\.\s+([\s\S]+)$/i)?.[1] ?? '') : '';
        return `Resultado do treino: some as repetições de ${prescription.scoreMovement.name} realizadas nos ${prescription.sets} sets.${suffix ? ` ${suffix}` : ''}`;
      }),
    ),
  ];
}

export function scoredIntervalAnalysisIssue(
  analysis: Pick<WodAnalysisOutput, 'format' | 'rounds'>,
  source: string,
): string | null {
  const prescription = readScoredIntervals(source);
  if (!prescription) return null;
  const { sets, workMinutes, restMinutes, buyIn, scoreMovement } = prescription;
  const issue = `Preserve ${sets} blocos de AMRAP ${workMinutes} min, entrada uma vez por bloco e max ${scoreMovement.name} como score; ${restMinutes == null ? 'descanso nao informado' : `descanso ${restMinutes} min`}.`;
  if (analysis.format !== 'INTERVAL' || analysis.rounds?.length !== sets) return issue;
  const expectedMovements = [...buyIn, { ...scoreMovement, reps: null }];
  for (const [index, round] of analysis.rounds.entries()) {
    if (
      round.roundNumber !== index + 1 ||
      round.movements.length !== expectedMovements.length ||
      round.movements.some((movement, position) => {
        const expected = expectedMovements[position]!;
        return (
          !matchesScoredMovement(movement, expected) ||
          (['reps', 'distanceMeters', 'calories'] as const).some(
            (metric) => (movement[metric] ?? null) !== (expected[metric] ?? null),
          ) ||
          (expected.loadDescription != null &&
            movement.loadDescription?.replace(/\s/g, '') !== expected.loadDescription)
        );
      })
    )
      return issue;
    // Timing survives persistence through the existing round labels, without a DB migration.
    const label = round.label ?? '';
    if (
      !new RegExp(`\\b${workMinutes} min\\b`).test(label) ||
      (restMinutes != null && !new RegExp(`\\brest ${restMinutes} min\\b`).test(label)) ||
      (restMinutes == null && /\b(?:rest|descanso)\s+\d+\s*min\b/i.test(label))
    )
      return issue;
  }
  return null;
}

export function validateScoredIntervalStrategy(
  analysis: WodAnalysisOutput,
  output: StrategyOutput,
  ctx: RefinementCtx,
) {
  const prescription = readScoredIntervals(analysis.extractedText ?? '');
  if (!prescription) return;
  const issue = scoredIntervalAnalysisIssue(analysis, analysis.extractedText!);
  if (issue) {
    ctx.addIssue({ code: 'custom', path: ['target'], message: `Reanalise o WOD. ${issue}` });
    return;
  }
  const scoreName = scoredMovementKey(prescription.scoreMovement.name);
  if (
    output.warnings.some(
      (warning) =>
        reconcileScoredIntervalWarnings([warning], [analysis.extractedText])[0] !== warning,
    )
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['warnings'],
      message: `Maximo e o objetivo: some as reps efetivamente realizadas de ${prescription.scoreMovement.name} nos ${prescription.sets} sets. Nao declare que o resultado nao pode ser somado.`,
    });
  }
  const mentionsScore = (text: string) => scoredMovementKey(text).includes(scoreName);
  if (
    output.target != null &&
    (!mentionsScore(output.target) || /rounds?|voltas?|rodadas?/i.test(output.target))
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['target'],
      message: `Meta deve contar somente ${prescription.scoreMovement.name} somados nos blocos, nunca rounds ou tempo total. Sem base para prever reps, use null.`,
    });
  }
  if (!mentionsScore(output.goal) || !/\b(?:som\w*|total|acumul\w*)\b/i.test(output.goal)) {
    ctx.addIssue({
      code: 'custom',
      path: ['goal'],
      message: `Objetivo: maximizar a soma de ${prescription.scoreMovement.name} nos blocos.`,
    });
  }
  const rest = new RegExp(
    `\\b${prescription.restMinutes}\\s*(?:min(?:uto)?s?\\b|['\u2019\u2032]|:00)`,
  );
  if (prescription.restMinutes != null && !rest.test(output.restStrategy)) {
    ctx.addIssue({
      code: 'custom',
      path: ['restStrategy'],
      message: `Preserve ${prescription.restMinutes} min de descanso prescrito entre blocos.`,
    });
  }
  if (
    prescription.restMinutes == null &&
    /(?:descans\w*|recuper\w*|rest)\s*(?:de\s+|por\s+)?\d+\s*(?:min\w*|['\u2019\u2032])/i.test(
      output.restStrategy,
    )
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['restStrategy'],
      message:
        'O descanso entre sets nao foi informado; preserve a incerteza, sem prescrever um intervalo inventado.',
    });
  }
  const pacing = output.pacing.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const field of ['pacing', 'energyManagement'] as const) {
    const text = output[field].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    // Reject the reported template that saves the opening set to attack only at the end.
    if (
      /^(?:guarde|poupe|economize)\s+(?:as?\s+)?(?:pernas|energia|folego)\b.*\b(?:bloco|set)\s*1\b/i.test(
        text,
      ) &&
      /\b(?:aperte|acelere|ataque)\b.*\b(?:no|para o)\s*(?:(?:bloco|set)\s*)?(?:\d+|ultimo)\b/i.test(
        text,
      )
    ) {
      ctx.addIssue({
        code: 'custom',
        path: [field],
        message:
          'Cada set abre uma janela de pontuacao: ataque a entrada com controle desde o primeiro set para maximizar o total, sem guardar o ataque apenas para o ultimo.',
      });
    }
  }
  for (const match of pacing.matchAll(
    /(?:primeir\w*|ultim\w*)\s+(\d+)\s*(?:min\w*|['\u2019\u2032])/gi,
  )) {
    if (Number(match[1]) > prescription.workMinutes) {
      ctx.addIssue({
        code: 'custom',
        path: ['pacing'],
        message: `Oriente cada janela de ${prescription.workMinutes} min, sem pacing continuo atraves dos descansos.`,
      });
    }
  }
}
