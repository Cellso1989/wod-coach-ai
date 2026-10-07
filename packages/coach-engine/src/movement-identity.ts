const aliases: Record<string, string> = {
  t2b: 'toes to bar',
  hsw: 'handstand walk',
  du: 'double under',
  'double unders': 'double under',
  bmu: 'bar muscle up',
  'bar m.u.': 'bar muscle up',
  'bar m.u': 'bar muscle up',
  'bar muscle ups': 'bar muscle up',
  burpees: 'burpee',
  thrusters: 'thruster',
  'air squats': 'air squat',
  'pull ups': 'pull up',
  'back squats': 'back squat',
  'front squats': 'front squat',
  rowing: 'row',
  running: 'run',
};

export function movementIdentity(name: string): string {
  const key = name
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, ' ');
  return Object.hasOwn(aliases, key) ? aliases[key]! : key;
}
