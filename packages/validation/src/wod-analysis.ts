import { z } from "zod";
import { wodFormatSchema, movementCategorySchema } from "./enums.js";

const demandScale = z.number().int().min(1).max(10);

export const wodMovementOutputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: movementCategorySchema,
  reps: z.number().int().min(0).max(10_000).nullable().optional(),
  distanceMeters: z.number().min(0).max(100_000).nullable().optional(),
  loadDescription: z.string().trim().max(120).nullable().optional(),
  calories: z.number().int().min(0).max(10_000).nullable().optional(),
});

export type WodMovementOutput = z.infer<typeof wodMovementOutputSchema>;

/**
 * Formato bruto esperado da resposta da IA (WodAnalyzerAgent, Fase 5).
 * Nunca confiamos neste JSON sem passar por este schema primeiro
 * (seção 30). `confidence` reflete a certeza real da IA — nada aqui
 * deve ser inventado quando a informação não está no WOD (seção 38).
 */
export const wodAnalysisOutputSchema = z.object({
  format: wodFormatSchema.nullable(),
  durationMinutes: z.number().int().min(0).max(180).nullable(),
  stimulus: z.string().trim().max(200).nullable(),
  movements: z.array(wodMovementOutputSchema).max(30),
  estimatedDemand: z.object({
    engine: demandScale,
    grip: demandScale,
    legs: demandScale,
    gymnastics: demandScale,
    technical: demandScale,
  }),
  estimatedIntensity: demandScale.nullable(),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string().max(300)).max(10).default([]),
});

export type WodAnalysisOutput = z.infer<typeof wodAnalysisOutputSchema>;
