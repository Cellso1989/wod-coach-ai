// Load editing is independent of the analysis category: Wall Ball is often conditioning.
export function isWodLoadMovement(movement: { name: string; category: string }): boolean {
  const name = movement.name
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, ' ');
  return movement.category === 'weightlifting' || /\bwall ?balls?\b/.test(name);
}
