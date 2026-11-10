import { normalizeWodLoadName } from '@wod-coach-ai/types';
import type { WodMovementOutput } from '@wod-coach-ai/validation';
import { movementIdentity } from './movement-identity.js';

type PrescribedMovement = Pick<
  WodMovementOutput,
  'name' | 'reps' | 'distanceMeters' | 'calories' | 'loadDescription'
>;

export function scoredMovementKey(name: string): string {
  return movementIdentity(normalizeWodLoadName(name))
    .replace(/\bmuscle ups\b/g, 'muscle up')
    .replace(/\bsnatches\b/g, 'snatch')
    .replace(/\bwall ?balls\b/g, 'wall ball')
    .replace(/\bwallball\b/g, 'wall ball')
    .replace(/\blunges\b/g, 'lunge')
    .replace(/\bbox jumps\b/g, 'box jump')
    .replace(/\bburpees\b/g, 'burpee');
}

const names: Record<string, string> = {
  run: 'Run',
  row: 'Row',
  bike: 'Bike',
  'handstand walk': 'Handstand walk',
  'ring muscle up': 'Ring muscle up',
  'bar muscle up': 'Bar muscle up',
  'squat snatch': 'Squat snatch',
  'wall ball': 'Wall Ball',
  'dumbbell overhead lunge': 'Dumbbell Overhead lunge',
  burpee: 'Burpee',
  'burpee box jump': 'Burpee box jump',
  'box jump': 'Box jump',
  thruster: 'Thruster',
  'toes to bar': 'Toes to Bar',
  'pull up': 'Pull-up',
  'air squat': 'Air squat',
  'double under': 'Double under',
};

function readMovement(text: string): PrescribedMovement | null {
  const load = text.match(/^(.+?)\s+(\d+(?:[.,]\d+)?(?:\/\d+(?:[.,]\d+)?)?)\s*kg$/i);
  const movementKey = scoredMovementKey(load?.[1] ?? text);
  const name = Object.hasOwn(names, movementKey) ? names[movementKey] : undefined;
  return name
    ? { name, loadDescription: load ? `${load[2]!.replaceAll(',', '.')}kg` : null }
    : null;
}

export function matchesScoredMovement(
  actual: PrescribedMovement,
  expected: PrescribedMovement,
): boolean {
  if (scoredMovementKey(actual.name) === scoredMovementKey(expected.name)) return true;
  // A distance-qualified name is safe only when it repeats the prescribed run distance.
  const qualified = actual.name.trim().match(/^(\d+)\s*(?:m|meters?|metros?)\s+(run|running)$/i);
  return (
    expected.name === 'Run' && qualified != null && Number(qualified[1]) === expected.distanceMeters
  );
}

// Recognize the complete source, never a prefix of an unknown phase or movement.
export function readScoredIntervals(source: string) {
  const lines = source
    .normalize('NFKC')
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (/^wod$/i.test(lines[0] ?? '')) lines.shift();
  const sets = lines[0]?.match(/^(\d+)\s+sets$/i);
  const work = lines[1]?.match(/^(?:amrap|anmrap)\s+(\d+)\s*(?:['\u2019\u2032]|min(?:utos)?)$/i);
  if (!sets || !work) return null;
  const setCount = Number(sets[1]);
  const workMinutes = Number(work[1]);
  if (setCount < 1 || setCount > 20 || workMinutes < 1 || setCount * workMinutes > 180) return null;
  const body = lines.slice(2);
  const explicitScore = body
    .at(-1)
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/^(?:score|pontuacao|resultado)\s*[:=]\s*(?:(?:max(?:imo)?)(?:\s+reps)?\s+)?(.+)$/i);
  if (explicitScore) body.pop();
  const rest = body
    .at(-1)
    ?.match(/^(?:rest|descanso)\s+(\d+)\s*(?:['\u2019\u2032]|min(?:utos)?)$/i);
  if (rest) body.pop();
  const restMinutes = rest ? Number(rest[1]) : null;
  if (restMinutes != null && (restMinutes < 1 || restMinutes > 180)) return null;
  const max = body
    .pop()
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/^(?:max|maximo)(?:\s+reps)?\s+(.+)$/i);
  const scoreMovement = max ? readMovement(max[1]!) : null;
  if (!scoreMovement || ['Run', 'Row', 'Bike', 'Handstand walk'].includes(scoreMovement.name))
    return null;
  if (
    explicitScore &&
    scoredMovementKey(explicitScore[1]!) !== scoredMovementKey(scoreMovement.name)
  )
    return null;
  if (!body.length || body.length > 29) return null;
  const buyIn: PrescribedMovement[] = [];
  for (const line of body) {
    const distance = line.match(/^(\d+)\s*(?:m|metros?)\s+(.+)$/i);
    const calories = line.match(/^(\d+)\s*cal(?:orias|ories)?\s+(.+)$/i);
    const reps = line.match(/^(\d+)\s+(.+)$/i);
    const match = distance ?? calories ?? reps;
    const movement = match ? readMovement(match[2]!) : null;
    if (!match || !movement || Number(match[1]) < 1 || Number(match[1]) > 10_000) return null;
    if (distance && !['Run', 'Row', 'Handstand walk'].includes(movement.name)) return null;
    if (calories && !['Row', 'Bike'].includes(movement.name)) return null;
    if (!distance && !calories && ['Run', 'Row', 'Bike', 'Handstand walk'].includes(movement.name))
      return null;
    buyIn.push({
      ...movement,
      [distance ? 'distanceMeters' : calories ? 'calories' : 'reps']: Number(match[1]),
    });
  }
  const movementKeys = [...buyIn, scoreMovement].map((movement) =>
    scoredMovementKey(movement.name),
  );
  if (new Set(movementKeys).size !== movementKeys.length) return null;
  return { sets: setCount, workMinutes, restMinutes, buyIn, scoreMovement };
}
