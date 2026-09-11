import { z } from "zod";

export const wodResultSchema = z.object({
  score: z.string().trim().min(1).max(120),
  timeSeconds: z.number().int().min(0).max(36_000).optional(),
  rounds: z.number().int().min(0).max(1000).optional(),
  reps: z.number().int().min(0).max(100_000).optional(),
  load: z.number().min(0).max(1000).optional(),
  distance: z.number().min(0).max(1_000_000).optional(),
});

export type WodResultInput = z.infer<typeof wodResultSchema>;
