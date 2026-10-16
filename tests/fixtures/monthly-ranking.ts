import type { RankingResult } from '../../apps/api/src/lib/monthly-ranking.js';

export const rankingUsers = [
  { id: 'a', name: 'Marina Costa' },
  { id: 'b', name: 'Rafael Lima' },
  { id: 'c', name: 'Camila Souza' },
  { id: 'd', name: 'Diego Martins' },
  { id: 'e', name: 'Luiza Santos' },
];

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
