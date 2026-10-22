import type { RankingResult } from '../../apps/api/src/lib/monthly-ranking.js';

export const rankingUsers = [
  { id: 'a', name: 'Marina Costa' },
  { id: 'b', name: 'Rafael Lima' },
  { id: 'c', name: 'Camila Souza' },
  { id: 'd', name: 'Diego Martins' },
  { id: 'e', name: 'Luiza Santos' },
];

export function calorieBikeRankingResult(userId: string, score: string, bikeName = 'Bike') {
  const result = rankingResult(userId, score);
  const analysis = result.wod.analysis!;
  analysis.format = 'ROUNDS_FOR_TIME';
  analysis.durationMinutes = 12;
  const movements = [
    {
      name: 'Double DB Devil Press',
      category: 'mixed_modal',
      reps: 10,
      calories: null,
      distanceMeters: null,
      loadDescription: '22 kg',
    },
    {
      name: 'Toes to Bar',
      category: 'gymnastics',
      reps: 20,
      calories: null,
      distanceMeters: null,
      loadDescription: null,
    },
    {
      name: bikeName,
      category: 'monostructural',
      reps: null,
      calories: 20,
      distanceMeters: null,
      loadDescription: null,
    },
  ];
  analysis.roundBreakdown = [1, 2, 3].map((roundNumber) => ({
    roundNumber,
    movements: structuredClone(movements),
  }));
  analysis.movements = movements.map((movement) => ({
    ...movement,
    reps: movement.reps == null ? null : movement.reps * 3,
    calories: movement.calories == null ? null : movement.calories * 3,
  }));
  return result;
}

export function rankingResult(
  userId: string,
  score: string,
  overrides: Partial<RankingResult> = {},
): RankingResult {
  return {
    id: `${userId}-${score}`,
    score,
    createdAt: new Date('2026-10-16T15:00:00Z'),
    wod: {
      userId,
      name: 'Fran',
      rawText: '21-15-9 Thruster 43 kg / Pull-up. Time cap 14 min.',
      analysis: {
        format: 'FOR_TIME',
        durationMinutes: 14,
        roundBreakdown: null,
        rawResponse: {},
        movements: [
          {
            name: 'Thruster',
            category: 'weightlifting',
            reps: 45,
            loadDescription: '43 kg',
            distanceMeters: null,
            calories: null,
          },
          {
            name: 'Pull-up',
            category: 'gymnastics',
            reps: 45,
            loadDescription: null,
            distanceMeters: null,
            calories: null,
          },
        ],
      },
    },
    ...overrides,
  };
}
