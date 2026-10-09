import type { WodAnalysisOutput, StrategyOutput } from '@wod-coach-ai/validation';
import type { RefinementCtx } from 'zod';
import { movementIdentity } from './movement-identity.js';

// Recognize this complete prescription only; unknown lines or phases need the analyzer.
export function readScoredIntervals(source: string) {
  const lines = source
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (/^wod$/i.test(lines[0] ?? '')) lines.shift();
  const sets = lines[0]?.match(/^(\d+)\s+sets$/i);
  const work = lines[1]?.match(/^amrap\s+(\d+)\s*(?:['\u2019\u2032]|min(?:utos)?)$/i);
  const run = lines[2]?.match(/^(\d+)\s*m\s+run$/i);
  const rings = lines[3]?.match(/^(\d+)\s+ring\s+muscle[ -]?ups?$/i);
  const snatch = lines[4]?.match(/^max\s+squat\s+snatch(?:\s+(\d+(?:\.\d+)?)\s*kg)?$/i);
  const rest = lines[5]?.match(/^rest\s+(\d+)\s*(?:['\u2019\u2032]|min(?:utos)?)$/i);
  if (!sets || !work || !run || !rings || !snatch || !rest) return null;
  if (
    lines.length !== 6 &&
    !(
      lines.length === 7 &&
      /^(?:score|pontuacao)\s*[:=]\s*(?:max(?:imo)?\s+)?squat\s+snatch$/i.test(lines[6]!)
    )
  )
    return null;
  const values = [sets[1], work[1], run[1], rings[1], rest[1]].map(Number);
  if (values.some((value) => value <= 0) || values[0]! > 20 || values[1]! * values[0]! > 180)
    return null;
  return {
    sets: values[0]!,
    workMinutes: values[1]!,
    distance: values[2]!,
    ringReps: values[3]!,
    restMinutes: values[4]!,
    load: snatch[1] ? `${snatch[1]}kg` : null,
  };
}

function key(name: string) {
  return movementIdentity(name)
    .replace(/\bups\b/g, 'up')
    .replace(/\bsnatches\b/g, 'snatch');
}

function isPrescribedRun(name: string, distance: number): boolean {
  if (key(name) === 'run') return true;
  const qualified = name.trim().match(/^(\d+)\s*(?:m|meters?|metros?)\s+(run|running)$/i);
  return qualified != null && Number(qualified[1]) === distance;
}

export function scoredIntervalAnalysisIssue(
  analysis: Pick<WodAnalysisOutput, 'format' | 'rounds'>,
  source: string,
): string | null {
  const prescription = readScoredIntervals(source);
  if (!prescription) return null;
  const { sets, workMinutes, restMinutes, distance, ringReps, load } = prescription;
  const issue = `Preserve ${sets} blocos de AMRAP ${workMinutes} min, descanso ${restMinutes} min, corrida e RMU uma vez por bloco e max squat snatch como score.`;
  if (analysis.format !== 'INTERVAL' || analysis.rounds?.length !== sets) return issue;
  for (const [index, round] of analysis.rounds.entries()) {
    const [run, rings, snatch] = round.movements;
    if (
      round.roundNumber !== index + 1 ||
      round.movements.length !== 3 ||
      !run ||
      !isPrescribedRun(run.name, distance) ||
      run.distanceMeters !== distance ||
      !rings ||
      key(rings.name) !== 'ring muscle up' ||
      rings.reps !== ringReps ||
      !snatch ||
      key(snatch.name) !== 'squat snatch' ||
      snatch.reps != null ||
      (load && snatch.loadDescription?.replace(/\s/g, '') !== load)
    )
      return issue;
    // Timing survives persistence through the existing round labels, without a DB migration.
    const label = round.label ?? '';
    if (
      !new RegExp(`\\b${workMinutes} min\\b`).test(label) ||
      !new RegExp(`\\brest ${restMinutes} min\\b`).test(label)
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
  if (
    output.target != null &&
    (!/squat\s+snatch/i.test(output.target) || /rounds?|voltas?|rodadas?/i.test(output.target))
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['target'],
      message:
        'Meta deve contar somente squat snatches somados nos blocos, nunca rounds ou tempo total. Sem base para prever reps, use null.',
    });
  }
  if (!/squat\s+snatch/i.test(output.goal)) {
    ctx.addIssue({
      code: 'custom',
      path: ['goal'],
      message: 'Objetivo: maximizar a soma de squat snatches nos blocos.',
    });
  }
  const rest = new RegExp(
    `\\b${prescription.restMinutes}\\s*(?:min(?:uto)?s?\\b|['\u2019\u2032]|:00)`,
  );
  if (!rest.test(output.restStrategy)) {
    ctx.addIssue({
      code: 'custom',
      path: ['restStrategy'],
      message: `Preserve ${prescription.restMinutes} min de descanso prescrito entre blocos.`,
    });
  }
  const pacing = output.pacing.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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
