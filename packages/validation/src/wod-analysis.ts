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
 * Um round individual de um WOD estruturado em rounds (ex: 3 rounds de
 * 30-20-10 HSPU / 15 Thrusters / 10 Bar M.U., onde as reps de HSPU mudam
 * a cada round mas Thruster/BMU ficam fixos). Só é preenchido quando o
 * WOD tem essa estrutura por round — para WODs simples (ex: "5 rounds de
 * 10 pull-ups"), basta o total em "movements", sem precisar repetir round
 * a round.
 */
export const wodRoundOutputSchema = z.object({
  roundNumber: z.number().int().min(1).max(50),
  movements: z.array(wodMovementOutputSchema).max(30),
});

export type WodRoundOutput = z.infer<typeof wodRoundOutputSchema>;

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
  rounds: z.array(wodRoundOutputSchema).max(20).nullable().optional(),
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

/**
 * Permite ao atleta sobrescrever manualmente o tempo/time cap do WOD quando
 * a IA não conseguiu inferi-lo do texto (ou inferiu errado).
 */
export const wodAnalysisUpdateSchema = z.object({
  durationMinutes: z.number().int().min(0).max(180).nullable(),
});

export type WodAnalysisUpdateInput = z.infer<typeof wodAnalysisUpdateSchema>;
