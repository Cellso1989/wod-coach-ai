import { z } from "zod";

export const sexSchema = z.enum(["MALE", "FEMALE", "OTHER"]);
export const crossfitLevelSchema = z.enum(["SCALED", "INTERMEDIATE", "RX", "ELITE"]);

export const athleteProfileSchema = z.object({
  birthDate: z.coerce.date().optional(),
  heightCm: z.number().int().min(80).max(260).optional(),
  weightKg: z.number().min(20).max(400).optional(),
  sex: sexSchema.optional(),

  crossfitSince: z.coerce.date().optional(),
  level: crossfitLevelSchema.optional(),
  competitionCategory: z.string().trim().max(120).optional(),
  weeklyFrequency: z.number().int().min(0).max(14).optional(),

  goals: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  injuries: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  limitedMovements: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  equipment: z.array(z.string().trim().min(1).max(60)).max(40).default([]),
});

export type AthleteProfileInput = z.infer<typeof athleteProfileSchema>;
