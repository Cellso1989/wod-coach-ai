import type { WodAnalysisOutput, WodMovementOutput } from '@wod-coach-ai/validation';

// Analysis payload from the failed production request; no request/user identifiers.
export const productionIntervalSource =
  "Wod\n\n4 Sets\nAmrap 3'\n200m run\n8 Ring muscle up\nMax Squat snatch\nRest 1'";
const blockMovements: WodMovementOutput[] = [
  {
    name: '200m run',
    category: 'monostructural',
    reps: null,
    distanceMeters: 200,
    loadDescription: null,
    calories: null,
  },
  {
    name: 'Ring muscle up',
    category: 'gymnastics',
    reps: 8,
    distanceMeters: null,
    loadDescription: null,
    calories: null,
  },
  {
    name: 'Squat snatch',
    category: 'weightlifting',
    reps: null,
    distanceMeters: null,
    loadDescription: 'Max effort',
    calories: null,
  },
];
export const productionIntervalAnalysis: WodAnalysisOutput = {
  extractedText: productionIntervalSource,
  format: 'INTERVAL',
  durationMinutes: 12,
  targetMinutes: null,
  stimulus: 'engine + gymnastics',
  movements: blockMovements.map((movement) => ({
    ...movement,
    ...(movement.distanceMeters != null ? { distanceMeters: 800 } : {}),
    ...(movement.reps != null ? { reps: 32 } : {}),
  })),
  rounds: Array.from({ length: 4 }, (_, index) => ({
    roundNumber: index + 1,
    label: `Bloco ${index + 1}: AMRAP 3 min; rest 1 min`,
    movements: blockMovements,
  })),
  estimatedDemand: { engine: 8, grip: 8, legs: 6, gymnastics: 8, technical: 7 },
  estimatedIntensity: 8,
  confidence: 0.85,
  warnings: [
    'Interpretei como 4 blocos de AMRAP 3 minutos com 1 minuto de descanso (duracao total de trabalho = 12 min).',
    'Falta informar a carga para Squat snatch. Preencha em Editar cargas.',
    'Max Squat snatch nao especifica repeticoes por bloco; registrei como esforco maximo.',
  ],
};
