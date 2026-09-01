import { describe, it, expect } from "vitest";
import { wodAnalysisOutputSchema } from "@wod-coach-ai/validation";

const VALID = {
  format: "AMRAP",
  durationMinutes: 15,
  stimulus: "mixed_modal",
  movements: [{ name: "Toes to Bar", category: "gymnastics", reps: 10 }],
  estimatedDemand: { engine: 8, grip: 7, legs: 7, gymnastics: 6, technical: 5 },
  estimatedIntensity: 8,
  confidence: 0.9,
  warnings: [],
};

describe("wodAnalysisOutputSchema", () => {
  it("accepts a well-formed analysis", () => {
    expect(wodAnalysisOutputSchema.safeParse(VALID).success).toBe(true);
  });

  it("accepts nulls for fields the AI could not determine", () => {
    const result = wodAnalysisOutputSchema.safeParse({
      ...VALID,
      format: null,
      durationMinutes: null,
      stimulus: null,
      estimatedIntensity: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown movement category (not part of the CrossFit taxonomy)", () => {
    const result = wodAnalysisOutputSchema.safeParse({
      ...VALID,
      movements: [{ name: "Bench Press", category: "powerlifting" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a demand score outside 1-10", () => {
    const result = wodAnalysisOutputSchema.safeParse({
      ...VALID,
      estimatedDemand: { ...VALID.estimatedDemand, grip: 15 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a confidence outside 0-1", () => {
    const result = wodAnalysisOutputSchema.safeParse({ ...VALID, confidence: 1.5 });
    expect(result.success).toBe(false);
  });

  it("defaults warnings to an empty array when omitted", () => {
    const { warnings, ...rest } = VALID;
    void warnings;
    const result = wodAnalysisOutputSchema.parse(rest);
    expect(result.warnings).toEqual([]);
  });
});
