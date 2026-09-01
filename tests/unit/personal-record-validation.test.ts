import { describe, it, expect } from "vitest";
import { personalRecordSchema } from "@wod-coach-ai/validation";

describe("personalRecordSchema", () => {
  it("accepts a lift PR", () => {
    const result = personalRecordSchema.safeParse({
      movementName: "Back Squat",
      value: 140,
      unit: "kg",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a benchmark WOD PR (time-based)", () => {
    const result = personalRecordSchema.safeParse({
      movementName: "Fran",
      value: 192,
      unit: "sec",
      notes: "Rx",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-positive value", () => {
    const result = personalRecordSchema.safeParse({ movementName: "Deadlift", value: 0, unit: "kg" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty movement name", () => {
    const result = personalRecordSchema.safeParse({ movementName: "", value: 100, unit: "kg" });
    expect(result.success).toBe(false);
  });
});
