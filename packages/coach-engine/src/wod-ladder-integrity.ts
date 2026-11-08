import type { StrategyOutput, WodAnalysisOutput } from '@wod-coach-ai/validation';
import type { RefinementCtx } from 'zod';
import { movementIdentity } from './movement-identity.js';
import { readTimePrescription } from './wod-time-prescription.js';

interface LadderMovement {
  name: string;
  reps: number[];
}

// Only recognize a complete, compact round prescription. Explicit phases, loads,
// intervals and unequal ladders need the analyzer, not a partial regex inference.
export function readCompactLadders(source: string): LadderMovement[] | null {
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const movements: LadderMovement[] = [];
  let reps: number[] | null = null;
  let groupSize = 0;
  for (const line of lines) {
    if (/^(?:wod|for time|rounds for time|\d+ rounds?)\s*:?$/i.test(line)) continue;
    if (/^(?:time cap|tempo|cap)\s*:?\s*\d+\s*min(?:utes|utos)?$/i.test(line)) continue;
    if (readTimePrescription(line, 'target').length || readTimePrescription(line, 'cap').length)
      continue;
    if (/^\d+(?:\s*[-\u2013\u2192]\s*\d+){1,19}$/.test(line)) {
      if (reps && !groupSize) return null;
      reps = line.split(/\s*[-\u2013\u2192]\s*/).map(Number);
      if (reps.some((value) => value <= 0 || value > 1000)) return null;
      groupSize = 0;
      continue;
    }
    const name = movementIdentity(line);
    if (!reps || !/^[a-z][a-z .]*$/.test(name)) return null;
    // A closed vocabulary prevents interpreting prose/phase markers as movements.
    if (
      ![
        'thruster',
        'toes to bar',
        'bar muscle up',
        'burpee',
        'pull up',
        'air squat',
        'double under',
        'hspu',
        'handstand push up',
        'wall ball',
      ].includes(name)
    )
      return null;
    movements.push({ name, reps });
    groupSize++;
  }
  if (
    !groupSize ||
    !movements.length ||
    new Set(movements.map((item) => item.name)).size !== movements.length
  )
    return null;
  if (movements.some((item) => item.reps.length !== movements[0]!.reps.length)) return null;
  return movements;
}

export function compactLadderAnalysisIssue(
  analysis: Pick<WodAnalysisOutput, 'rounds'>,
  source: string,
): string | null {
  const expected = readCompactLadders(source);
  if (!expected) return null;
  const rounds = analysis.rounds;
  if (
    rounds?.length !== expected[0]!.reps.length ||
    rounds.some(
      (round, index) =>
        round.roundNumber !== index + 1 ||
        round.movements.length !== expected.length ||
        round.movements.some((item, movementIndex) => {
          const prescription = expected[movementIndex]!;
          return (
            movementIdentity(item.name) !== prescription.name ||
            item.reps !== prescription.reps[index] ||
            item.distanceMeters != null ||
            item.calories != null
          );
        }),
    )
  ) {
    return `Preserve as escadas por round na ordem dos movimentos: ${expected
      .map((item) => `${item.name}: ${item.reps.join('-')}`)
      .join('; ')}. Nao use totais nem separe os movimentos em fases sem indicacao na fonte.`;
  }
  return null;
}

// Parse only a complete numeric instruction. Seconds, loads, alternatives and
// free-form advice are outside this grammar and must not become inferred reps.
function explicitBreakReps(text: string): number | null {
  const expression = text
    .normalize('NFKC')
    .trim()
    .replace(/[.!]$/, '')
    .trim()
    .replace(/\s*(?:reps?(?:\s+(?:direto|unbroken))?|direto|unbroken)$/i, '')
    .trim();
  const product = expression.match(/^(\d+)\s*[x\u00d7]\s*(\d+)$/i);
  let count: number;
  if (product) count = Number(product[1]) * Number(product[2]);
  else if (/^\d+(?:\s*[/+]\s*\d+)*$/.test(expression)) {
    count = expression.split(/[/+]/).reduce((sum, item) => sum + Number(item.trim()), 0);
  } else return null;
  return Number.isSafeInteger(count) ? count : null;
}

function roundBreakMismatch(
  entry: { movement: string; strategy: string },
  expected: Map<number, number>,
): { round: number; reps: number; prescribed: number } | null {
  const clauses = entry.strategy.split(';');
  let hasRoundClause = false;
  for (const clause of clauses) {
    const scoped = clause.match(/^\s*(?:round|r|bloco|set)\s*(\d+)\s*:\s*(.*?)\s*$/i);
    if (!scoped) continue;
    hasRoundClause = true;
    const round = Number(scoped[1]);
    const prescribed = expected.get(round);
    const reps = explicitBreakReps(scoped[2]!);
    if (prescribed !== undefined && reps !== null && reps !== prescribed)
      return { round, reps, prescribed };
  }
  // A separate entry can scope the first instruction through its movement label.
  const label = entry.movement.match(/\((?:round|r|bloco|set)\s*(\d+)\s*[-:]\s*\d+\s*reps?\s*\)$/i);
  if (!hasRoundClause && label) {
    const round = Number(label[1]);
    const prescribed = expected.get(round);
    const reps = explicitBreakReps(clauses[0]!);
    if (prescribed !== undefined && reps !== null && reps !== prescribed)
      return { round, reps, prescribed };
  }
  return null;
}

export function validateStrategyLadderIntegrity(
  analysis: WodAnalysisOutput,
  output: StrategyOutput,
  ctx: RefinementCtx,
): void {
  const rounds = analysis.rounds;
  if (!rounds?.length) return;
  for (const summary of analysis.movements) {
    const key = movementIdentity(summary.name);
    const occurrences = rounds.flatMap((round) =>
      round.movements
        .filter((item) => movementIdentity(item.name) === key)
        .map((item) => ({ item, roundNumber: round.roundNumber })),
    );
    const items = occurrences.map(({ item }) => item);
    const reps = items.map((item) => item.reps);
    if (items.length < 2 || reps.some((value) => value == null) || new Set(reps).size < 2) continue;
    const ladder = reps as number[];
    for (const field of ['breakStrategy', 'movementStrategy'] as const) {
      const entries = output[field].filter(
        (entry) => movementIdentity(entry.movement.split(/\s*\(/)[0]!) === key,
      );
      const expectedReps = new Map(
        occurrences.map(({ item, roundNumber }) => [roundNumber, item.reps!]),
      );
      // Repeated occurrences of this movement inside one block are ambiguous.
      for (const entry of expectedReps.size === occurrences.length ? entries : []) {
        const mismatch = roundBreakMismatch(entry, expectedReps);
        if (mismatch)
          ctx.addIssue({
            code: 'custom',
            path: [field],
            message: `Para ${summary.name}, o round ${mismatch.round} tem ${mismatch.prescribed} reps; a quebra informada soma ${mismatch.reps}. As series desse round devem somar exatamente ${mismatch.prescribed}, sem usar o volume de outro round.`,
          });
      }
      // Require one concise entry with the ordered ladder, or explicit per-round labels.
      const ladderPattern = new RegExp(`\\b${ladder.join('\\s*[-/\\u2013\\u2192]\\s*')}\\b`);
      const covers =
        entries.some((entry) => ladderPattern.test(entry.movement)) ||
        ladder.every((value, index) =>
          entries.some(
            (entry) =>
              new RegExp(
                `\\b(?:round|r|bloco|set)\\s*${occurrences[index]!.roundNumber}\\b`,
                'i',
              ).test(entry.movement) &&
              new RegExp(`\\b${value}\\s*reps?\\b`, 'i').test(entry.movement),
          ),
        );
      const aggregate = entries.some((entry) => {
        const totalInLabel =
          summary.reps != null &&
          new RegExp(`\\b${summary.reps}\\s*reps?\\b`, 'i').test(entry.movement);
        const oversizedSet = [...entry.strategy.matchAll(/\b(\d+)\s*[x\u00d7]\s*(\d+)\b/gi)].some(
          (match) => Number(match[1]) * Number(match[2]) > Math.max(...ladder),
        );
        return totalInLabel || oversizedSet;
      });
      if (!covers || aggregate)
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: `Para ${summary.name}, identifique ${ladder.join('-')} por round no campo movement (ou round N - X reps em cada entrada). Quebre somente as reps daquele round, nunca o total ${summary.reps}.`,
        });
    }
  }
}
