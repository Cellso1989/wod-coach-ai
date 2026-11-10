// Only known equipment misspellings; preserve movement qualifiers and quantities.
export function normalizeWodLoadName(name: string): string {
  return name
    .normalize('NFKC')
    .replace(/\b(?:dumbel|dumbell)\b/gi, (equipment) =>
      equipment[0] === equipment[0]!.toUpperCase() ? 'Dumbbell' : 'dumbbell',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

// Load editing is independent of the analysis category: Wall Ball is often conditioning.
export function isWodLoadMovement(movement: { name: string; category: string }): boolean {
  const name = movement.name
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, ' ');
  return movement.category === 'weightlifting' || /\bwall ?balls?\b/.test(name);
}
