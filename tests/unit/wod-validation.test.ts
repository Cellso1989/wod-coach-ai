import { describe, it, expect } from "vitest";
import { wodSubmissionFieldsSchema } from "@wod-coach-ai/validation";

describe("wodSubmissionFieldsSchema", () => {
  it("accepts an empty payload (image-only submissions have no text fields)", () => {
    const result = wodSubmissionFieldsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts a text WOD with name and notes", () => {
    const result = wodSubmissionFieldsSchema.safeParse({
      rawText: "15 min AMRAP\n10 Toes to Bar\n15 Wall Balls\n200m Run",
      name: "Treino de quinta",
      notes: "Foco em consistência",
    });

    expect(result.success).toBe(true);
  });

  it("rejects an empty rawText string", () => {
    const result = wodSubmissionFieldsSchema.safeParse({ rawText: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a rawText exceeding the max length", () => {
    const result = wodSubmissionFieldsSchema.safeParse({ rawText: "a".repeat(10_001) });
    expect(result.success).toBe(false);
  });
});
