import type { RefinementCtx } from 'zod';
import type { StrategyOutput } from '@wod-coach-ai/validation';

export function validateStrategyTextIntegrity(output: StrategyOutput, ctx: RefinementCtx): void {
  const fields: Array<{ path: Array<string | number>; text: string | null }> = [
    ...(
      [
        'pacing',
        'restStrategy',
        'transitionStrategy',
        'energyManagement',
        'goal',
        'target',
        'criticalPoint',
      ] as const
    ).map((field) => ({ path: [field], text: output[field] })),
    ...output.warnings.map((text, index) => ({ path: ['warnings', index], text })),
    ...(['breakStrategy', 'movementStrategy'] as const).flatMap((field) =>
      output[field].flatMap((item, index) =>
        (['movement', 'strategy'] as const).map((part) => ({
          path: [field, index, part],
          text: item[part],
        })),
      ),
    ),
  ];
  for (const field of fields) {
    if (!field.text) continue;
    const text = field.text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    if (
      /\d\s*(?:kg(?:s|rams?)?|kilogram(?:s|as)?|kilos?|quil(?:os|ogramas)?|lbs?|pounds?|libras?|g|grams?|gramas?)\b/i.test(
        text,
      ) ||
      /\b(?:PR|1RM)\s*(?:(?:de|:|=|e|eh|foi)\s*)?\d/i.test(text) ||
      /\d\s*%\s*(?:(?:do|de|of)\s*)?(?:PR|1RM)\b/i.test(text)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: field.path,
        message:
          'Concentre pesos numericos e PRs numericos em loadRecommendation com evidencia validada. Neste campo oriente por RPE, quebras ou carga prescrita, sem repetir/inventar pesos.',
      });
    }
  }
}
