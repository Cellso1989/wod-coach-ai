import type { MonthlyRanking, RankingPerformance } from '@wod-coach-ai/types';

// Fictional daily WOD: four athletes share one standings table.
export function createRankingDemo(date: string): MonthlyRanking {
  const names = [
    'Marina Costa',
    'Rafael Lima',
    'Gabriel Oliveira',
    'Bruno Alves',
    'Camila Souza',
    'Diego Martins',
    'Luiza Santos',
    'Pedro Rocha',
  ];
  const scores = ['05:10', '05:30', 'CAP 5', 'CAP 15'];
  const data: MonthlyRanking = {
    month: date.slice(0, 7),
    summary: {
      users: 8,
      rankedAthletes: 4,
      comparableWorkouts: Math.min(3, Number(date.slice(8))),
      recordedResults: 4 * Math.min(3, Number(date.slice(8))),
      uncomparedResults: 0,
    },
    athletes: names.map((name, index) => {
      const score = scores[index];
      const performance: RankingPerformance[] = score
        ? [
            {
              date,
              workout: 'Wod de hoje - Fran',
              score,
              position: index + 1,
              athletes: 4,
              points: 100 - index * 25,
              status: score.startsWith('CAP') ? 'cap' : 'finished',
              remainingReps: score.startsWith('CAP') ? Number(score.replace('CAP ', '')) : null,
            },
          ]
        : [];
      const history = [
        { offset: 2, points: [50, 25, 75, 100] },
        { offset: 1, points: [75, 50, 100, 25] },
      ]
        .filter((day) => Number(date.slice(8)) > day.offset)
        .flatMap((day) =>
          score
            ? [
                {
                  ...performance[0]!,
                  date: new Date(new Date(`${date}T12:00:00Z`).getTime() - day.offset * 86400000)
                    .toISOString()
                    .slice(0, 10),
                  workout: 'Wod anterior',
                  points: day.points[index]!,
                },
              ]
            : [],
        );
      return {
        userId: `demo-${index}`,
        name,
        position: score ? index + 1 : null,
        points: score
          ? history.reduce((sum, p) => sum + p.points, 0) + performance[0]!.points
          : null,
        comparedWorkouts: score ? history.length + 1 : 0,
        isCurrentUser: index === 2,
        performances: [...history, ...performance],
        todayPerformances: performance,
      };
    }),
  };
  data.athletes.sort(
    (a, b) => (b.points ?? -1) - (a.points ?? -1) || a.name.localeCompare(b.name, 'pt-BR'),
  );
  let position = 1;
  data.athletes.forEach((athlete, index) => {
    if (athlete.points == null) return;
    if (index > 0 && athlete.points !== data.athletes[index - 1]!.points) position = index + 1;
    athlete.position = position;
  });
  return data;
}
