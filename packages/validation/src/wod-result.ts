import { z } from "zod";

export const wodResultSchema = z.object({
  score: z.string().trim().min(1).max(120),
  timeSeconds: z.number().int().min(0).max(36_000).optional(),
  rounds: z.number().int().min(0).max(1000).optional(),
  reps: z.number().int().min(0).max(100_000).optional(),
  load: z.number().min(0).max(1000).optional(),
  distance: z.number().min(0).max(1_000_000).optional(),
  rpe: z.number().int().min(1).max(10),
});

export type WodResultInput = z.infer<typeof wodResultSchema>;

export const strategyOutcomeSchema = z.enum(["YES", "PARTIALLY", "NO"]);

export const wodFeedbackSchema = z.object({
  strategyWorked: strategyOutcomeSchema.optional(),
  gripScore: z.number().int().min(1).max(10).optional(),
  legsScore: z.number().int().min(1).max(10).optional(),
  breathingScore: z.number().int().min(1).max(10).optional(),
  overallDifficulty: z.number().int().min(1).max(10).optional(),
  whereItBroke: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export type WodFeedbackInput = z.infer<typeof wodFeedbackSchema>;
