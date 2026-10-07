export function formatStrategyRoundLabels(text: string): string {
  return text.replace(
    /\b(Rounds?|R)\s*(\d+)(?:\s*[-\u2013\u2014]\s*(?:R\s*)?(\d+))?\b/gi,
    (original, _prefix: string, first: string, last?: string) => {
      if (!last) return _prefix.toLowerCase() === 'r' ? `Round ${first}` : original;
      const start = Number(first);
      const end = Number(last);
      if (start < 1 || end < start || end > 100) return original;
      if (start === end) return `Round ${first}`;
      const rounds = Array.from({ length: end - start + 1 }, (_, index) => start + index);
      return `Rounds ${rounds.slice(0, -1).join(', ')} e ${end}`;
    },
  );
}
