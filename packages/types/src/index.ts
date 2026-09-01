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

/**
 * Biblioteca sugerida de PRs (seção 24). Lista inicial, expansível —
 * PersonalRecord.movementName é texto livre no banco, isto é só a
 * sugestão exibida no frontend.
 */
export const COMMON_LIFTS = [
  "Back Squat",
  "Front Squat",
  "Overhead Squat",
  "Deadlift",
  "Clean",
  "Power Clean",
  "Snatch",
  "Power Snatch",
  "Clean & Jerk",
  "Shoulder Press",
  "Push Press",
  "Push Jerk",
  "Bench Press",
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

