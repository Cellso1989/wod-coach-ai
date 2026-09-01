import { describe, it, expect } from "vitest";
import { calculateReadinessScore } from "@wod-coach-ai/coach-engine";

describe("calculateReadinessScore", () => {
  it("returns a high score and band for an ideal check-in", () => {
    const result = calculateReadinessScore({
      sleep: 10,
      energy: 10,
      stress: 1,
      muscleSoreness: 1,
      jointPain: 1,
      motivation: 10,
    });

    expect(result.score).toBe(100);
    expect(result.band).toBe("high");
    expect(result.cautionFlags).toEqual([]);
  });

  it("returns a low score and band for a poor check-in", () => {
    const result = calculateReadinessScore({
      sleep: 1,
      energy: 1,
      stress: 10,
      muscleSoreness: 10,
      jointPain: 10,
      motivation: 1,
    });

    expect(result.score).toBe(0);
    expect(result.band).toBe("low");
  });

  it("is deterministic for the same input", () => {
    const input = {
      sleep: 6,
      energy: 5,
      stress: 4,
      muscleSoreness: 3,
      jointPain: 2,
      motivation: 7,
    };

    const first = calculateReadinessScore(input);
    const second = calculateReadinessScore(input);

    expect(first).toEqual(second);
  });

  it("flags high joint pain as a caution without diagnosing", () => {
    const result = calculateReadinessScore({
      sleep: 8,
      energy: 8,
      stress: 3,
      muscleSoreness: 3,
      jointPain: 8,
      motivation: 8,
    });

    expect(result.cautionFlags.some((flag) => flag.includes("Dor articular"))).toBe(true);
  });

  it("flags very low sleep as a caution", () => {
    const result = calculateReadinessScore({
      sleep: 2,
      energy: 8,
      stress: 3,
      muscleSoreness: 3,
      jointPain: 2,
      motivation: 8,
    });

    expect(result.cautionFlags.some((flag) => flag.includes("Sono"))).toBe(true);
  });

  it("clamps out-of-range inputs instead of throwing", () => {
    const result = calculateReadinessScore({
      sleep: 999,
      energy: -5,
      stress: 1,
      muscleSoreness: 1,
      jointPain: 1,
      motivation: 1,
    });

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
