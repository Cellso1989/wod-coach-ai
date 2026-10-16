import type { WodAnalysis } from './api.js';

export function getWodResultFeedback(
  score: string,
  analysis?: Pick<WodAnalysis, 'format' | 'durationMinutes'> | null,
): string {
  const text = score.trim();
  if (/^cap(?=\s|\d|$)/i.test(text)) return 'Hoje não rendeu, hein! 😂';

  if (
    analysis?.durationMinutes != null &&
    ['FOR_TIME', 'ROUNDS_FOR_TIME', 'CHIPPER'].includes(analysis.format ?? '')
  ) {
    const clock = text.match(/^(\d+):([0-5]\d)(?:\s*(?:min|mins|minutos?))?$/i);
    const minutes = text.match(/^(\d+(?:[.,]\d+)?)\s*(?:min|mins|minutos?)$/i);
    const seconds = clock
      ? Number(clock[1]) * 60 + Number(clock[2])
      : minutes
        ? Number(minutes[1]!.replace(',', '.')) * 60
        : null;
    if (seconds != null && seconds > analysis.durationMinutes * 60) {
      return 'Hoje não rendeu, hein! 😂';
    }
  }

  return 'Boa, meu atleta! Mais um WOD pra conta! 🔥💪😂';
}
