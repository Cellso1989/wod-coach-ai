export interface RankingPerformance {
  date: string;
  workout: string;
  score: string;
  position: number;
  athletes: number;
  points: number;
  status: 'finished' | 'cap';
  remainingReps: number | null;
}

export interface RankedAthlete {
  userId: string;
  name: string;
  position: number | null;
  points: number | null;
  comparedWorkouts: number;
  isCurrentUser: boolean;
  performances: RankingPerformance[];
  todayPerformances: RankingPerformance[];
}

export interface MonthlyRanking {
  month: string;
  summary: {
    users: number;
    rankedAthletes: number;
    comparableWorkouts: number;
    recordedResults: number;
    uncomparedResults: number;
  };
  athletes: RankedAthlete[];
}

export interface DailyRanking extends Omit<MonthlyRanking, 'month'> {
  date: string;
}
