import type { WodAnalysisOutput } from '@wod-coach-ai/validation';

export const wallBallLoadSource =
  '4 sets\n\nAnmrap 3 min\n\n21 wall ball\n16 dumbel Overhead lunge \nMáximo burpee box jump';

const movements = [
  { name: 'Wall Ball', category: 'conditioning' as const, reps: 21, loadDescription: null },
  {
    name: 'Dumbbell Overhead lunge',
    category: 'weightlifting' as const,
    reps: 16,
    loadDescription: null,
  },
  { name: 'Burpee box jump', category: 'conditioning' as const, reps: null, loadDescription: null },
];

export const wallBallLoadAnalysis: WodAnalysisOutput = {
  format: 'INTERVAL',
  durationMinutes: 12,
  stimulus: 'mixed_modal',
  movements: movements.map((movement) => ({
    ...movement,
    reps: movement.reps == null ? null : movement.reps * 4,
  })),
  rounds: Array.from({ length: 4 }, (_, index) => ({
    roundNumber: index + 1,
    label: `Set ${index + 1} — AMRAP 3 min`,
    movements: movements.map((movement) => ({ ...movement })),
  })),
  estimatedDemand: { engine: 8, grip: 6, legs: 8, gymnastics: 3, technical: 5 },
  estimatedIntensity: 8,
  confidence: 0.9,
  warnings: ['Falta informar a carga de Dumbbell Overhead lunge. Preencha em Editar cargas.'],
};
