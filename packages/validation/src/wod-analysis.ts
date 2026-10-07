import { z } from 'zod';
import { wodFormatSchema, movementCategorySchema } from './enums.js';

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
 * a cada round mas Thruster/BMU ficam fixos). Contagens fixas tambem exigem
 * rounds uniformes repetidos; totais em "movements" nao substituem a estrutura.
 * A validacao ligada ao texto/imagem ocorre no WodAnalyzerAgent.
 */
export const wodRoundOutputSchema = z.object({
  roundNumber: z.number().int().min(1).max(50),
  label: z.string().trim().min(1).max(80).optional(),
  movements: z.array(wodMovementOutputSchema).min(1).max(30),
});

export type WodRoundOutput = z.infer<typeof wodRoundOutputSchema>;

/**
 * Formato bruto esperado da resposta da IA (WodAnalyzerAgent, Fase 5).
 * Nunca confiamos neste JSON sem passar por este schema primeiro
 * (seção 30). `confidence` reflete a certeza real da IA — nada aqui
 * deve ser inventado quando a informação não está no WOD (seção 38).
 */
export const wodAnalysisOutputSchema = z.object({
  extractedText: z.string().trim().max(10_000).nullable().optional(),
  format: wodFormatSchema.nullable(),
  durationMinutes: z.number().int().min(0).max(180).nullable().optional().default(null),
  targetMinutes: z.number().int().min(0).max(180).nullable().optional(),
  stimulus: z.string().trim().max(200).nullable(),
  movements: z.array(wodMovementOutputSchema).min(1).max(30),
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

export const wodLoadOverrideSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: movementCategorySchema,
  loadDescription: z.string().trim().min(1).max(120).nullable(),
});

// Partial manual edits complement the analysis without another AI call.
export const wodAnalysisUpdateSchema = z
  .object({
    durationMinutes: z.number().int().min(0).max(180).nullable().optional(),
    versionId: z.string().min(1).optional(),
    movementLoads: z
      .array(
        z.object({
          id: z.string().min(1),
          loadDescription: z.string().trim().min(1).max(120).nullable(),
        }),
      )
      .min(1)
      .max(30)
      .optional(),
  })
  .refine((input) => input.durationMinutes !== undefined || input.movementLoads !== undefined, {
    message: 'Informe tempo ou cargas para atualizar.',
  })
  .refine(
    (input) =>
      !input.movementLoads ||
      new Set(input.movementLoads.map((item) => item.id)).size === input.movementLoads.length,
    {
      message: 'Movimentos duplicados.',
    },
  );

export type WodAnalysisUpdateInput = z.infer<typeof wodAnalysisUpdateSchema>;
