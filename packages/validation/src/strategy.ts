import { z } from "zod";

export const strategyMovementNoteSchema = z.object({
  movement: z.string().trim().min(1).max(120),
  strategy: z.string().trim().min(1).max(600),
});

export type StrategyMovementNote = z.infer<typeof strategyMovementNoteSchema>;

/**
 * Saída bruta esperada do StrategyCoachAgent (Fase 8, seção 12/37).
 * Como todo output de IA, nunca é confiada sem passar por este schema
 * (seção 30). `confidence` reflete a certeza real da IA dado os dados
 * disponíveis — nunca inventamos carga/PR/histórico ausente (seção 38).
 *
 * Limites de tamanho generosos de propósito: uma explicação de coach
 * legítima e útil pode passar de 300 caracteres facilmente. Um limite
 * apertado demais rejeita respostas boas e desperdiça a chamada à IA
 * (visto na prática: "energyManagement" > 300 chars derrubou 2 tentativas).
 */
export const strategyOutputSchema = z.object({
  recommendedIntensity: z.number().int().min(1).max(10),
  targetRpe: z.number().int().min(1).max(10),
  loadRecommendation: z.string().trim().max(500).nullable(),
  pacing: z.string().trim().min(1).max(1200),
  breakStrategy: z.array(strategyMovementNoteSchema).max(15),
  restStrategy: z.string().trim().min(1).max(800),
  movementStrategy: z.array(strategyMovementNoteSchema).max(15),
  transitionStrategy: z.string().trim().max(800),
  energyManagement: z.string().trim().max(1200),
  goal: z.string().trim().min(1).max(500),
  target: z.string().trim().max(200).nullable(),
  criticalPoint: z.string().trim().max(200).nullable(),
  warnings: z.array(z.string().max(500)).max(10).default([]),
  confidence: z.number().min(0).max(1),
});

export type StrategyOutput = z.infer<typeof strategyOutputSchema>;
