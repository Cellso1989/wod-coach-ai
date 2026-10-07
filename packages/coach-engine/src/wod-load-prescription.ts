import type { z } from 'zod';
import type { WodRoundOutput, wodLoadOverrideSchema } from '@wod-coach-ai/validation';
import { movementIdentity } from './movement-identity.js';

export type WodLoadOverride = z.infer<typeof wodLoadOverrideSchema>;
type Movement = { name: string; category: string; loadDescription?: string | null };

export function sameLoadMovement(left: Movement, right: Movement): boolean {
  return (
    left.category === right.category && movementIdentity(left.name) === movementIdentity(right.name)
  );
}

function normalized(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-\s]+/g, ' ');
}

export function reconcileLoadWarnings(warnings: string[], movements: Movement[]): string[] {
  const missing = movements.filter(
    (item) => item.category === 'weightlifting' && !item.loadDescription?.trim(),
  );
  const remaining = warnings.filter((warning) => {
    if (warning.startsWith('Carga nao informada para ')) return false;
    const text = normalized(warning);
    const englishMissingLoad =
      /^(?:(?:loads?|weights?)\s+(?:not specified|not provided|not informed|missing|unspecified)|missing\s+(?:load|weight))\b/i.test(
        text,
      );
    if (
      !englishMissingLoad &&
      (!/\bcargas?\b/.test(text) || !/nao informad|falt|ausent|sem carga/.test(text))
    )
      return true;
    if (missing.some((item) => text.includes(normalized(item.name)))) return true;
    return (
      missing.length > 0 &&
      !movements.some(
        (item) => item.loadDescription?.trim() && text.includes(normalized(item.name)),
      )
    );
  });
  if (missing.length)
    remaining.unshift(
      `Carga nao informada para ${missing
        .map((item) => item.name)
        .join(', ')
        .slice(0, 200)}; confirme antes de executar.`,
    );
  return [...new Set(remaining)].slice(0, 10);
}

// Apply only uniquely identified movements; never collapse differing round loads.
export function applyLoadOverrides<T extends Movement>(
  movements: T[],
  rounds: WodRoundOutput[] | null | undefined,
  overrides: WodLoadOverride[],
  warnings: string[],
) {
  const accepted = overrides.filter((override) => {
    const matches = movements.filter((item) => sameLoadMovement(item, override));
    const roundMatches =
      rounds?.flatMap((round) =>
        round.movements.filter((item) => sameLoadMovement(item, override)),
      ) ?? [];
    return (
      matches.length === 1 &&
      new Set(roundMatches.map((item) => item.loadDescription?.trim() || null)).size <= 1
    );
  });
  const update = <M extends Movement>(item: M): M => {
    const override = accepted.find((candidate) => sameLoadMovement(item, candidate));
    return override ? { ...item, loadDescription: override.loadDescription } : item;
  };
  const updated = movements.map(update);
  return {
    movements: updated,
    rounds:
      rounds?.map((round) => ({ ...round, movements: round.movements.map(update) })) ?? rounds,
    warnings: reconcileLoadWarnings(
      [
        ...warnings,
        ...overrides
          .filter((item) => !accepted.includes(item))
          .map(
            (item) =>
              `Carga manual de ${item.name} nao aplicada: confira os movimentos e as cargas de cada round.`,
          ),
      ],
      updated,
    ),
    accepted,
  };
}
