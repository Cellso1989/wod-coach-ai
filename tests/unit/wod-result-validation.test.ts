import { describe, it, expect } from "vitest";
import { wodResultSchema } from "@wod-coach-ai/validation";

describe("wodResultSchema", () => {
  it("accepts a minimal result (score only)", () => {
    const result = wodResultSchema.safeParse({ score: "8 rounds + 12 reps" });
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
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty score", () => {
    const result = wodResultSchema.safeParse({ score: "" });
    expect(result.success).toBe(false);
  });
});
