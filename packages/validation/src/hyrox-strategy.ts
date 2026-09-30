import { z } from 'zod';

export const hyroxDivisionSchema = z.enum([
  'OPEN_MEN',
  'OPEN_WOMEN',
  'PRO_MEN',
  'PRO_WOMEN',
  'DOUBLES',
  'RELAY',
]);

export const hyroxExperienceSchema = z.enum(['first_timer', 'returning', 'competitive']);

export const hyroxStrategyInputSchema = z.object({
  rawWorkout: z.string().trim().min(10).max(5000),
  division: hyroxDivisionSchema,
  experience: hyroxExperienceSchema,
  targetTimeMinutes: z.number().int().min(10).max(180).nullable().optional(),
  runPaceSecondsPerKm: z.number().int().min(150).max(720).nullable().optional(),
  strengths: z.array(z.string().trim().min(1).max(80)).max(8).default([]),
  limiters: z.array(z.string().trim().min(1).max(80)).max(8).default([]),
  injuryNotes: z.string().trim().max(300).nullable().optional(),
  goal: z.string().trim().max(180).nullable().optional(),
});

export type HyroxStrategyInput = z.infer<typeof hyroxStrategyInputSchema>;

export const hyroxBlockPlanSchema = z.object({
  block: z.string().trim().min(1).max(80),
  focus: z.string().trim().min(1).max(80),
  execution: z.string().trim().min(1).max(180),
});

export const hyroxBreakStrategySchema = z.object({
  movement: z.string().trim().min(1).max(100),
  strategy: z.string().trim().min(1).max(160),
});

export const hyroxStrategyOutputSchema = z.object({
  workoutSummary: z.string().trim().min(1).max(140),
  target: z.string().trim().max(180).nullable(),
  runPace: z.string().trim().max(180).nullable(),
  pacing: z.string().trim().min(1).max(180),
  blockPlan: z.array(hyroxBlockPlanSchema).min(1).max(8),
  breakStrategy: z.array(hyroxBreakStrategySchema).max(6),
  transitionStrategy: z.string().trim().min(1).max(180),
  criticalRisk: z.string().trim().min(1).max(180),
  finalPush: z.string().trim().min(1).max(180),
  warnings: z.array(z.string().trim().max(180)).max(6).default([]),
  confidence: z.number().min(0).max(1),
});

export type HyroxStrategyOutput = z.infer<typeof hyroxStrategyOutputSchema>;
