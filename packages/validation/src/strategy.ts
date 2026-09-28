import { z } from "zod";

export const strategyMovementNoteSchema = z.object({
  movement: z.string().trim().min(1).max(120),
  strategy: z.string().trim().min(1).max(110),
});

export type StrategyMovementNote = z.infer<typeof strategyMovementNoteSchema>;

/**
 * Saída bruta esperada do StrategyCoachAgent (Fase 8, seção 12/37).
 * Como todo output de IA, nunca é confiada sem passar por este schema
 * (seção 30). `confidence` reflete a certeza real da IA dado os dados
 * disponíveis — nunca inventamos carga/PR/histórico ausente (seção 38).
 *
 * Limites curtos de propósito: o usuário pediu recomendações objetivas,
 * lidas rapidamente no celular no meio do treino — não textos longos de
 * coach. O SYSTEM_PROMPT do agente também instrui explicitamente a ser
 * conciso; estes limites são o teto que reforça isso.
 */
export const strategyOutputSchema = z.object({
  recommendedIntensity: z.number().int().min(1).max(10),
  targetRpe: z.number().int().min(1).max(10),
  loadRecommendation: z.string().trim().max(180).nullable(),
  pacing: z.string().trim().min(1).max(180),
  breakStrategy: z.array(strategyMovementNoteSchema).max(8),
  restStrategy: z.string().trim().min(1).max(180),
  movementStrategy: z.array(strategyMovementNoteSchema).max(8),
  transitionStrategy: z.string().trim().max(160),
  energyManagement: z.string().trim().max(180),
  goal: z.string().trim().min(1).max(160),
  target: z.string().trim().max(90).nullable(),
  criticalPoint: z.string().trim().max(150).nullable(),
  warnings: z.array(z.string().max(180)).max(10).default([]),
  confidence: z.number().min(0).max(1),
});

export type StrategyOutput = z.infer<typeof strategyOutputSchema>;
