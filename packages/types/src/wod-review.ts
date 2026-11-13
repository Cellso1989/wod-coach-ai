export type WodWarningAction = 'interpretation' | 'duration' | 'loads' | 'source';

// Shared by the review UI and the strategy guard, including saved analyses.
export function wodWarningAction(warning: string): WodWarningAction {
  const text = warning
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (
    /^(?:interpretei|entendi)\b/i.test(text) ||
    /\b(?:format assumed|assumed format|format inferred|formato (?:presumido|assumido))\b/i.test(
      text,
    )
  )
    return 'interpretation';
  if (/\b(?:cargas?|pesos?|loads?|weights?)\b/i.test(text)) return 'loads';
  if (
    !/\b(?:descanso|rest)\b/i.test(text) &&
    !/^(?:a\s+)?(?:target|meta)\b/i.test(text) &&
    /\b(?:tempo|time[ -]?cap|duration)\b/i.test(text) &&
    /\b(?:falta|nao informad[oa]|ausente|missing|not (?:specified|provided|informed)|unspecified)\b/i.test(
      text,
    )
  )
    return 'duration';
  if (/\b(?:confirme|confirmar se|confirm (?:whether|if)|please confirm)\b/i.test(text))
    return 'interpretation';
  return 'source';
}
