import type { WodAnalysis } from './api.js';

export function compactStrategyTarget(target: string, hasTimeCap: boolean): string {
  const compact = target.replace(/^Terminar (?:entre|em)\s+/i, '');
  return hasTimeCap
    ? compact.replace(/,?\s*dentro do (?:time cap|tempo limite) de .+$/i, '').trim()
    : compact;
}

export function readableStrategyText(text: string): string {
  return text
    .replace(/\(?dataSufficiency\s*(?:[:=]\s*)?(?:low|moderate|high)?\)?/gi, '')
    .replace(
      /\b(low|moderate|high)\b/gi,
      (term) => ({ low: 'baixo', moderate: 'moderado', high: 'alto' })[term.toLowerCase()]!,
    )
    .replace(/\s+([,;.])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function isAnalysisReviewWarning(text: string): boolean {
  // A mixed warning with execution or safety guidance must remain visible.
  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (/dor|lesao|lombar|adapt|carga|escala|falha|cap|limite|risco|tecnica/.test(normalized))
    return false;
  return /interpretei|interprete|entendi|formato|confirme o movimento|confirme.*leitura/.test(
    normalized,
  );
}

function movementName(text: string): string {
  return text.split('(')[0]!.normalize('NFKC').trim().toLowerCase().replace(/[- ]+/g, ' ');
}

export function prescribedLoadForNote(note: string, analysis?: WodAnalysis | null): string | null {
  if (!analysis) return null;
  const movements = analysis.roundBreakdown?.length
    ? analysis.roundBreakdown.flatMap((round) => round.movements)
    : analysis.movements;
  const matches = movements.filter(
    (movement) => movementName(movement.name) === movementName(note),
  );
  if (!matches.length || matches.some((movement) => !movement.loadDescription?.trim())) return null;
  const loads = new Set(matches.map((movement) => movement.loadDescription!.trim()));
  // Never flatten changing round loads into one weight or guess movement aliases.
  return loads.size === 1 ? [...loads][0]! : null;
}
