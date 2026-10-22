import type { MonthlyRanking, RankingPerformance } from '@wod-coach-ai/types';

// A complete fictional example of three four-athlete confrontations.
export function createRankingDemo(month: string, activeMonth: string): MonthlyRanking {
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
  const scores = [200, 150, 175, 125, 125, 50, null, null];
  const positions = [1, 3, 2, 4, 4, 6, null, null];
  const hasResults = month === activeMonth;
  const results: RankingPerformance[][] = Array.from({ length: names.length }, () => []);
  const events = [
    {
      workout: 'Fran · 21-15-9',
      athletes: [0, 1, 2, 3],
      scores: ['05:10', '05:30', 'CAP 5', 'CAP 15'],
    },
    {
      workout: 'AMRAP 12 · ginásticos',
      athletes: [0, 1, 4, 5],
      scores: ['10 rounds', '8 rounds', '6 rounds', '4 rounds'],
    },
    {
      workout: 'Sprint · 5 rounds',
      athletes: [2, 3, 4, 5],
      scores: ['08:00', '08:30', 'CAP 8', 'CAP 20'],
    },
  ];
  for (const event of events) {
    event.athletes.forEach((athlete, place) => {
      const score = event.scores[place]!;
      const status = score.startsWith('CAP') ? 'cap' : 'finished';
      results[athlete]!.push({
        workout: event.workout,
        score,
        position: place + 1,
        athletes: 4,
        points: 100 - place * 25,
        status,
        remainingReps: status === 'cap' ? Number(score.replace('CAP ', '')) : null,
      });
    });
  }
  return {
    month,
    summary: {
      users: 8,
      rankedAthletes: hasResults ? 6 : 0,
      comparableWorkouts: hasResults ? 3 : 0,
      recordedResults: hasResults ? 15 : 0,
      uncomparedResults: hasResults ? 3 : 0,
    },
    athletes: names
      .map((name, index) => ({
        userId: `demo-${index}`,
        name,
        position: hasResults ? positions[index]! : null,
        points: hasResults ? scores[index]! : null,
        comparedWorkouts: hasResults ? results[index]!.length : 0,
        isCurrentUser: index === 2,
        performances: hasResults ? results[index]! : [],
      }))
      .sort((a, b) => (b.points ?? -1) - (a.points ?? -1) || a.name.localeCompare(b.name, 'pt-BR')),
  };
}
