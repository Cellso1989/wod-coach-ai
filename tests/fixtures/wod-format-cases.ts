import type {
  WodAnalysisOutput,
  WodMovementOutput,
  WodRoundOutput,
} from '@wod-coach-ai/validation';

const row: WodMovementOutput = { name: 'Row', category: 'monostructural', calories: 10 };
const burpee: WodMovementOutput = { name: 'Burpee', category: 'conditioning', reps: 5 };
const run: WodMovementOutput = { name: 'Run', category: 'monostructural', distanceMeters: 400 };
const squat: WodMovementOutput = {
  name: 'Back Squat',
  category: 'weightlifting',
  reps: 5,
  loadDescription: '70% do 1RM',
};
const round = (
  roundNumber: number,
  movements: WodMovementOutput[],
  label?: string,
): WodRoundOutput => ({
  roundNumber,
  movements,
  ...(label ? { label } : {}),
});
function fixture(
  name: string,
  rawText: string,
  format: WodAnalysisOutput['format'],
  durationMinutes: number | null,
  movements: WodMovementOutput[],
  rounds: WodRoundOutput[] | null = null,
) {
  const analysis: WodAnalysisOutput = {
    format,
    durationMinutes,
    stimulus: 'mixed_modal',
    movements,
    rounds,
    estimatedDemand: { engine: 7, grip: 6, legs: 7, gymnastics: 4, technical: 5 },
    estimatedIntensity: 8,
    confidence: 0.9,
    warnings: [],
  };
  return { name, rawText, analysis };
}

export const wodFormatCases = [
  fixture(
    'long text 10000 chars',
    'Observacoes: ' +
      'x'.repeat(10_000 - 'Observacoes: \nAMRAP 15 min: 10 cal Row'.length) +
      '\nAMRAP 15 min: 10 cal Row',
    'AMRAP',
    15,
    [row],
  ),
  fixture('AMRAP', 'AMRAP 15 min: 10 cal Row + 5 Burpee. Meta: 8 rounds', 'AMRAP', 15, [
    row,
    burpee,
  ]),
  fixture(
    'FOR_TIME ladder',
    'For Time: 21-15-9 Burpee. Time cap: 12 min',
    'FOR_TIME',
    12,
    [{ ...burpee, reps: 45 }],
    [21, 15, 9].map((reps, index) => round(index + 1, [{ ...burpee, reps }])),
  ),
  fixture(
    'EMOM alternating',
    'EMOM 6 min: minutos impares 10 cal Row; pares 5 Burpee',
    'EMOM',
    6,
    [
      { ...row, calories: 30 },
      { ...burpee, reps: 15 },
    ],
    Array.from({ length: 6 }, (_, index) => round(index + 1, [index % 2 === 0 ? row : burpee])),
  ),
  fixture(
    'E2MOM',
    'E2MOM 6 min: 400m Run',
    'E2MOM',
    6,
    [{ ...run, distanceMeters: 1200 }],
    [1, 2, 3].map((number) => round(number, [run])),
  ),
  fixture('CHIPPER', 'Chipper: 1000m Row + 50 Burpee. Time cap: 20 min', 'CHIPPER', 20, [
    { ...row, calories: null, distanceMeters: 1000 },
    { ...burpee, reps: 50 },
  ]),
  fixture(
    'ROUNDS_FOR_TIME',
    '3 rounds: 400m Run + 5 Burpee',
    'ROUNDS_FOR_TIME',
    null,
    [
      { ...run, distanceMeters: 1200 },
      { ...burpee, reps: 15 },
    ],
    [1, 2, 3].map((number) => round(number, [run, burpee])),
  ),
  fixture(
    'STRENGTH percentages',
    'Back Squat: 5 reps 70%, 3 reps 80%, 2 reps 85% do 1RM',
    'STRENGTH',
    null,
    [{ ...squat, reps: 10, loadDescription: '70/80/85% do 1RM' }],
    [5, 3, 2].map((reps, index) =>
      round(
        index + 1,
        [{ ...squat, reps, loadDescription: `${[70, 80, 85][index]}% do 1RM` }],
        `Set ${index + 1}`,
      ),
    ),
  ),
  fixture(
    'INTERVAL',
    '3 intervals: 400m Run, rest 2 min',
    'INTERVAL',
    null,
    [{ ...run, distanceMeters: 1200 }],
    [1, 2, 3].map((number) => round(number, [run])),
  ),
  fixture(
    'mixed blocks and loads',
    'Buy-in: 400m Run; 2 rounds: 5 Back Squat 40/60kg; Buy-out: 5 Burpee',
    'ROUNDS_FOR_TIME',
    15,
    [run, { ...squat, reps: 10, loadDescription: '40/60kg' }, burpee],
    [
      round(1, [run], 'Buy-in'),
      round(2, [{ ...squat, loadDescription: '40kg' }], 'Round 1'),
      round(3, [{ ...squat, loadDescription: '60kg' }], 'Round 2'),
      round(4, [burpee], 'Buy-out'),
    ],
  ),
];
