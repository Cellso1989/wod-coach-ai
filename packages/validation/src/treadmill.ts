import { z } from "zod";

export const treadmillEffortSchema = z.enum(["leve", "moderado", "moderado_alto", "forte", "maximo"]);

export const treadmillGenerateSchema = z.object({
  level: z.number().int().min(1).max(5),
  durationMinutes: z.number().int().min(5).max(60),
});

export const treadmillBlockSchema = z.object({
  startMinute: z.number().int().min(0),
  endMinute: z.number().int().min(0),
  speedRange: z.string().min(1).max(20),
  effort: treadmillEffortSchema,
});

export const treadmillSessionInputSchema = z.object({
  level: z.number().int().min(1).max(5),
  durationMinutes: z.number().int().min(5).max(60),
  blocks: z.array(treadmillBlockSchema).min(1),
  distanceKm: z.number().min(0).max(100).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
export type TreadmillSessionInput = z.infer<typeof treadmillSessionInputSchema>;
