import { z } from "zod";

export const dailyCheckinSchema = z.object({
  date: z.coerce.date().optional(),
  timeSeconds: z.number().int().nonnegative().optional(),
  rounds: z.number().int().nonnegative().optional(),
  reps: z.number().int().nonnegative().optional(),
  weightKg: z.number().min(20).max(400).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export type DailyCheckinInput = z.infer<typeof dailyCheckinSchema>;
