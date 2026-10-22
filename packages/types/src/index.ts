/**
 * Shared TypeScript types for WOD Coach AI.
 * Domain entities (Wod, WodAnalysis, WodStrategy, etc.) are added
 * incrementally as their owning phase is implemented.
 */

export const WOD_FORMATS = [
  "AMRAP",
  "FOR_TIME",
  "EMOM",
  "E2MOM",
  "CHIPPER",
  "ROUNDS_FOR_TIME",
  "STRENGTH",
  "INTERVAL",
] as const;

export type WodFormat = (typeof WOD_FORMATS)[number];

export const MOVEMENT_CATEGORIES = [
  "gymnastics",
  "weightlifting",
  "conditioning",
  "monostructural",
  "mixed_modal",
] as const;

export type MovementCategory = (typeof MOVEMENT_CATEGORIES)[number];

export const PERSONAL_RECORD_TYPES = [
  "UNKNOWN",
  "ONE_RM",
  "REP_MAX",
  "UNBROKEN_REPS",
  "TIME",
] as const;
export type PersonalRecordType = (typeof PERSONAL_RECORD_TYPES)[number];
export type { DailyRanking, MonthlyRanking, RankedAthlete, RankingPerformance } from './ranking.js';

/**
 * Biblioteca sugerida de PRs (seção 24). Lista inicial, expansível —
 * PersonalRecord.movementName é texto livre no banco, isto é só a
 * sugestão exibida no frontend.
 */
export const COMMON_LIFTS = [
  "Snatch",
  "Power Snatch",
  "Squat Snatch",
  "Hang Power Snatch",
  "Hang Squat Snatch",
  "Muscle Snatch",
  "Clean",
  "Power Clean",
  "Squat Clean",
  "Hang Power Clean",
  "Hang Squat Clean",
  "Clean & Jerk",
  "Split Jerk",
  "Push Jerk",
  "Push Press",
  "Strict Press",
  "Front Squat",
  "Back Squat",
  "Overhead Squat",
  "Deadlift",
  "Thruster",
  "Shoulder Press",
  "Bench Press",
] as const;

export const COMMON_GYMNASTICS = [
  "Pull-up",
  "Chest-to-Bar Pull-up",
  "Strict Pull-up",
  "Bar Muscle-up",
  "Ring Muscle-up",
  "Handstand Push-up",
  "Strict Handstand Push-up",
  "Deficit Handstand Push-up",
  "Ring Dip",
  "Strict Ring Dip",
  "Handstand Walk",
  "Toes to Bar",
  "Rope Climb",
  "Legless Rope Climb",
  "Double Under",
  "Pistol Squat",
  "GHD Sit-up",
] as const;

export const COMMON_BENCHMARK_WODS = [
  "Fran",
  "Helen",
  "Grace",
  "Isabel",
  "Diane",
  "Annie",
  "Karen",
  "Cindy",
  "Murph",
] as const;
