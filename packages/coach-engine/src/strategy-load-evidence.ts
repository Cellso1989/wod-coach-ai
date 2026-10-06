import { z, type RefinementCtx } from 'zod';
import type { StrategyCoachInput } from './strategy-coach-agent.js';
import { movementIdentity as key } from './movement-identity.js';

export const loadCalculationSchema = z.object({
  movement: z.string().trim().min(1).max(120),
  prValue: z.number().finite().positive(),
  prUnit: z.enum(['kg', 'lb']),
  prescriptionMode: z.enum(['as_written', 'adapted']).default('as_written'),
  adaptationReason: z.string().trim().min(1).max(120).optional(),
  loads: z
    .array(
      z.object({
        value: z.number().finite().positive(),
        unit: z.enum(['kg', 'lb']),
        percentage: z.number().finite().positive().nullable(),
      }),
    )
    .min(1)
    .max(20),
});

type Calculation = z.infer<typeof loadCalculationSchema>;
const massUnit = (unit: string) =>
  /^(?:kgs?)$/i.test(unit.trim()) ? 'kg' : /^(?:lbs?)$/i.test(unit.trim()) ? 'lb' : null;
// Exact avoirdupois pound conversion, NIST SP 811.
const KG_PER_LB = 0.45359237;

export function validateLoadCalculations(
  input: StrategyCoachInput,
  output: {
    loadRecommendation: string | null;
    loadCalculations?: Calculation[];
    warnings: string[];
  },
  ctx: RefinementCtx,
): void {
  const calculations = output.loadCalculations ?? [];
  const issue = (message: string) =>
    ctx.addIssue({ code: 'custom', path: ['loadRecommendation'], message });
  if (output.loadRecommendation == null) {
    if (calculations.length)
      issue('Use loadCalculations vazio quando loadRecommendation for null.');
    return;
  }
  if (!calculations.length) {
    issue(
      'Inclua loadCalculations para cada carga sugerida ou use loadRecommendation null, sem inventar pesos.',
    );
    return;
  }
  const movements = new Set([
    ...input.wodAnalysis.movements.map((item) => key(item.name)),
    ...(input.wodAnalysis.rounds ?? []).flatMap((round) =>
      round.movements.map((item) => key(item.name)),
    ),
  ]);
  for (const calculation of calculations) {
    if (calculation.prescriptionMode === 'adapted') {
      if (
        !calculation.adaptationReason ||
        !output.warnings.includes(calculation.adaptationReason)
      ) {
        issue(
          'Carga adaptada exige adaptationReason explicito em warnings, sem mudar a prescricao silenciosamente.',
        );
      }
    } else if (calculation.adaptationReason) {
      issue('Use prescriptionMode adapted ao informar adaptationReason.');
    }
    const record = input.athleteContext.relevantPersonalRecords.find(
      (record) =>
        key(record.movementName) === key(calculation.movement) &&
        Number.isFinite(record.value) &&
        record.value > 0 &&
        record.value === calculation.prValue &&
        massUnit(record.unit) === calculation.prUnit,
    );
    if (!movements.has(key(calculation.movement)) || !record) {
      issue(
        `Use o PR real do proprio movimento ${calculation.movement}, com valor e unidade originais. Um PR de outro movimento nao serve como base.`,
      );
    }
    const items = input.wodAnalysis.rounds?.length
      ? input.wodAnalysis.rounds.flatMap((round) => round.movements)
      : input.wodAnalysis.movements;
    const prescriptions = items.filter((item) => key(item.name) === key(calculation.movement));
    if (
      prescriptions.some((item) => /\b1RM\b/i.test(item.loadDescription ?? '')) &&
      !output.warnings.includes('Confirme com o coach se o PR informado representa 1RM.')
    ) {
      issue(
        'Contexto nao identifica modalidade do PR. Inclua em warnings: Confirme com o coach se o PR informado representa 1RM.',
      );
    }
    const percentages = prescriptions.map(
      (item) =>
        item.loadDescription?.match(
          /^\s*(\d+(?:[.,]\d+)?)\s*%\s*(?:(?:do|of)\s*)?(?:PR|1RM)?\s*$/i,
        )?.[1],
    );
    // Only compare an entirely recognized sequence, never partially interpret load prose.
    if (
      percentages.length &&
      percentages.every((value) => value != null) &&
      calculation.prescriptionMode === 'as_written'
    ) {
      const values = percentages.map((value) => Number(value!.replace(',', '.')));
      const expected =
        values.every((value) => value === values[0]) && calculation.loads.length === 1
          ? [values[0]]
          : values;
      if (
        expected.length !== calculation.loads.length ||
        calculation.loads.some((load, index) => load.percentage !== expected[index])
      ) {
        issue(
          `Preserve todos os percentuais e sua ordem por bloco de ${calculation.movement}, ou declare a adaptacao e seu aviso.`,
        );
      }
    }
    for (const load of calculation.loads) {
      if (load.percentage == null) continue;
      const convertedPr =
        calculation.prUnit === load.unit
          ? calculation.prValue
          : calculation.prUnit === 'lb'
            ? calculation.prValue * KG_PER_LB
            : calculation.prValue / KG_PER_LB;
      const expected = Math.round(((convertedPr * load.percentage) / 100) * 10) / 10;
      if (!Number.isFinite(expected) || Math.abs(expected - load.value) > 1e-8) {
        issue(
          `Confira o percentual e a conversao de ${calculation.movement}: arredonde a carga calculada para 0.1 ${load.unit}.`,
        );
      }
    }
  }
  const text = calculations
    .map((calculation) => {
      const loads = calculation.loads
        .map(
          (load) =>
            `${load.value}${load.unit}${load.percentage == null ? '' : ` (${load.percentage}%)`}`,
        )
        .join(' / ');
      return `${calculation.movement}${calculation.prescriptionMode === 'adapted' ? ' (adaptado)' : ''}: ${loads} (PR ${calculation.prValue}${calculation.prUnit})`;
    })
    .join('; ');
  if (output.loadRecommendation !== text) {
    issue(`loadRecommendation deve corresponder exatamente aos calculos validados: ${text}`);
  }
}
