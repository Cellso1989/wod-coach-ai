import { z } from "zod";

const scale = z.number().int().min(1).max(10);

export const dailyCheckinSchema = z.object({
  date: z.coerce.date().optional(),
  sleep: scale,
  energy: scale,
  stress: scale,
  muscleSoreness: scale,
  jointPain: scale,
  motivation: scale,
  weightKg: z.number().min(20).max(400).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export type DailyCheckinInput = z.infer<typeof dailyCheckinSchema>;
