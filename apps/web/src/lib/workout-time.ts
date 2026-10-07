export function parseWorkoutTime(value: string): number | undefined | null {
  const text = value.trim();
  if (!text) return undefined;
  if (!/^\d+(?::[0-5]\d)?$/.test(text)) return null;
  const parts = text.split(':');
  const seconds = parts.length === 1 ? Number(parts[0]) : Number(parts[0]) * 60 + Number(parts[1]);
  return Number.isSafeInteger(seconds) && seconds <= 2_147_483_647 ? seconds : null;
}
