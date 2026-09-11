import { describe, it, expect } from "vitest";
import {
  computeWodSimilarity,
  findSimilarWods,
  buildAthleteContext,
  type WodAnalysisSummary,
  type HistoricalWodEntry,
} from "@wod-coach-ai/coach-engine";

const NOW = new Date("2026-03-01T12:00:00.000Z");

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

const AMRAP_ANALYSIS: WodAnalysisSummary = {
  format: "AMRAP",
  durationMinutes: 15,
  stimulus: "mixed_modal",
  movements: [
    { name: "Toes to Bar", category: "gymnastics" },
    { name: "Wall Ball", category: "conditioning" },
    { name: "Run", category: "monostructural" },
  ],
};

describe("computeWodSimilarity", () => {
  it("scores an identical WOD as maximally similar", () => {
    const score = computeWodSimilarity(AMRAP_ANALYSIS, AMRAP_ANALYSIS);
    expect(score).toBeCloseTo(1, 5);
  });

  it("scores a completely unrelated WOD as near zero", () => {
    const strength: WodAnalysisSummary = {
      format: "STRENGTH",
      durationMinutes: null,
      stimulus: "heavy strength",
      movements: [{ name: "Back Squat", category: "weightlifting" }],
    };
    expect(computeWodSimilarity(AMRAP_ANALYSIS, strength)).toBeLessThan(0.2);
  });

  it("gives partial credit for shared movements with a different format", () => {
    const forTime: WodAnalysisSummary = {
      format: "FOR_TIME",
      durationMinutes: 15,
      stimulus: "mixed_modal",
      movements: [
        { name: "Toes to Bar", category: "gymnastics" },
        { name: "Wall Ball", category: "conditioning" },
      ],
    };
    const score = computeWodSimilarity(AMRAP_ANALYSIS, forTime);
    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThan(1);
  });
});

describe("findSimilarWods", () => {
  const history: HistoricalWodEntry[] = [
    {
      wodId: "similar-1",
      date: daysAgo(10),
      analysis: AMRAP_ANALYSIS,
      result: { score: "8 rounds" },
      previousStrategy: {
        recommendedIntensity: 8,
        targetRpe: 8,
        criticalPoint: "Grip",
        breakStrategy: [{ movement: "Toes to Bar", strategy: "5 + 5 desde o início." }],
      },
    },
    {
      wodId: "unrelated-1",
      date: daysAgo(5),
      analysis: {
        format: "STRENGTH",
        durationMinutes: null,
        stimulus: "heavy strength",
        movements: [{ name: "Deadlift", category: "weightlifting" }],
      },
      result: { score: "150kg" },
      previousStrategy: null,
    },
    {
      wodId: "not-analyzed",
      date: daysAgo(3),
      analysis: null,
      result: null,
      previousStrategy: null,
    },
  ];

  it("returns only WODs above the similarity threshold, sorted descending", () => {
    const matches = findSimilarWods(AMRAP_ANALYSIS, history);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.wodId).toBe("similar-1");
  });

  it("excludes WODs without an analysis", () => {
    const matches = findSimilarWods(AMRAP_ANALYSIS, history);
    expect(matches.some((m) => m.wodId === "not-analyzed")).toBe(false);
  });

  it("carries the previous strategy through into the similar-WOD match (Learning Loop, seção 17)", () => {
    const matches = findSimilarWods(AMRAP_ANALYSIS, history);
    expect(matches[0]?.previousStrategy).toEqual({
      recommendedIntensity: 8,
      targetRpe: 8,
      criticalPoint: "Grip",
      breakStrategy: [{ movement: "Toes to Bar", strategy: "5 + 5 desde o início." }],
    });
  });

  it("respects the limit parameter", () => {
    const manySimilar: HistoricalWodEntry[] = Array.from({ length: 10 }, (_, i) => ({
      wodId: `w${i}`,
      date: daysAgo(i + 1),
      analysis: AMRAP_ANALYSIS,
      result: null,
      previousStrategy: null,
    }));
    const matches = findSimilarWods(AMRAP_ANALYSIS, manySimilar, 3);
    expect(matches).toHaveLength(3);
  });
});

describe("buildAthleteContext", () => {
  it("reports low data sufficiency with too few historical wods and checkins", () => {
    const context = buildAthleteContext({
      targetAnalysis: AMRAP_ANALYSIS,
      historicalWods: [],
      checkins: [{ date: daysAgo(1) }],
      personalRecords: [],
      now: NOW,
    });
    expect(context.dataSufficiency).toBe("low");
  });

  it("computes training load windows from session count", () => {
    const historicalWods: HistoricalWodEntry[] = [
      { wodId: "a", date: daysAgo(2), analysis: AMRAP_ANALYSIS, result: { score: "x" }, previousStrategy: null },
      { wodId: "b", date: daysAgo(5), analysis: AMRAP_ANALYSIS, result: { score: "y" }, previousStrategy: null },
      { wodId: "c", date: daysAgo(20), analysis: AMRAP_ANALYSIS, result: { score: "z" }, previousStrategy: null },
    ];
    const context = buildAthleteContext({
      targetAnalysis: AMRAP_ANALYSIS,
      historicalWods,
      checkins: [],
      personalRecords: [],
      now: NOW,
    });
    expect(context.trainingLoad.last7Days.sessionCount).toBe(2);
    expect(context.trainingLoad.last28Days.sessionCount).toBe(3);
  });

  it("only returns personal records for movements present in the target WOD", () => {
    const context = buildAthleteContext({
      targetAnalysis: AMRAP_ANALYSIS,
      historicalWods: [],
      checkins: [],
      personalRecords: [
        { movementName: "Wall Ball", value: 20, unit: "reps", achievedAt: daysAgo(30) },
        { movementName: "Back Squat", value: 140, unit: "kg", achievedAt: daysAgo(30) },
      ],
      now: NOW,
    });
    expect(context.relevantPersonalRecords).toHaveLength(1);
    expect(context.relevantPersonalRecords[0]?.movementName).toBe("Wall Ball");
  });
});
