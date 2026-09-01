import { describe, it, expect } from "vitest";
import { wodResultSchema, wodFeedbackSchema } from "@wod-coach-ai/validation";

describe("wodResultSchema", () => {
  it("accepts a minimal result (score + rpe only)", () => {
    const result = wodResultSchema.safeParse({ score: "8 rounds + 12 reps", rpe: 9 });
    expect(result.success).toBe(true);
  });

  it("accepts a full result", () => {
    const result = wodResultSchema.safeParse({
      score: "12:34",
      timeSeconds: 754,
      rounds: 8,
      reps: 12,
      load: 60,
      distance: 200,
      rpe: 8,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an rpe outside 1-10", () => {
    const result = wodResultSchema.safeParse({ score: "Fran em 3:12", rpe: 11 });
    expect(result.success).toBe(false);
  });

  it("rejects an empty score", () => {
    const result = wodResultSchema.safeParse({ score: "", rpe: 7 });
    expect(result.success).toBe(false);
  });
});

describe("wodFeedbackSchema", () => {
  it("accepts an empty payload (all fields optional)", () => {
    const result = wodFeedbackSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts a full feedback", () => {
    const result = wodFeedbackSchema.safeParse({
      strategyWorked: "PARTIALLY",
      gripScore: 8,
      legsScore: 7,
      breathingScore: 6,
      overallDifficulty: 9,
      whereItBroke: "Quebrei TTB na quarta rodada",
      notes: "Grip foi o limitante",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid strategyWorked value", () => {
    const result = wodFeedbackSchema.safeParse({ strategyWorked: "MAYBE" });
    expect(result.success).toBe(false);
  });
});
