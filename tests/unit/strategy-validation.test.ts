import { describe, it, expect } from "vitest";
import { strategyOutputSchema } from "@wod-coach-ai/validation";

const VALID = {
  recommendedIntensity: 8,
  targetRpe: 8,
  loadRecommendation: null,
  pacing: "Ritmo controlado nos primeiros 5 minutos, acelerar no final.",
  breakStrategy: [{ movement: "Toes to Bar", strategy: "5 + 5 desde o início." }],
  restStrategy: "Descansos curtos entre rodadas quando necessário.",
  movementStrategy: [{ movement: "Wall Ball", strategy: "Unbroken nas primeiras rodadas." }],
  transitionStrategy: "Minimizar tempo parado entre movimentos.",
  energyManagement: "Controlar esforço nos primeiros 5 minutos.",
  goal: "Manter consistência, sem falhar antes da metade.",
  target: "8-9 rounds",
  criticalPoint: "Grip",
  warnings: [],
  confidence: 0.8,
};

describe("strategyOutputSchema", () => {
  it("accepts a well-formed strategy", () => {
    expect(strategyOutputSchema.safeParse(VALID).success).toBe(true);
  });

  it("accepts null for loadRecommendation, target and criticalPoint", () => {
    const result = strategyOutputSchema.safeParse({
      ...VALID,
      loadRecommendation: null,
      target: null,
      criticalPoint: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a recommendedIntensity outside 1-10", () => {
    const result = strategyOutputSchema.safeParse({ ...VALID, recommendedIntensity: 11 });
    expect(result.success).toBe(false);
  });

  it("rejects a confidence outside 0-1", () => {
    const result = strategyOutputSchema.safeParse({ ...VALID, confidence: 1.2 });
    expect(result.success).toBe(false);
  });

  it("rejects a breakStrategy entry without a strategy field", () => {
    const result = strategyOutputSchema.safeParse({
      ...VALID,
      breakStrategy: [{ movement: "Toes to Bar" }],
    });
    expect(result.success).toBe(false);
  });

  it("defaults warnings to an empty array when omitted", () => {
    const { warnings, ...rest } = VALID;
    void warnings;
    const result = strategyOutputSchema.parse(rest);
    expect(result.warnings).toEqual([]);
  });
});
