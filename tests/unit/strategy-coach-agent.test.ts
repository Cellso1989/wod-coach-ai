import { describe, it, expect, vi } from "vitest";
import {
  generateStrategy,
  StrategyGenerationError,
  type SendMessage,
  type StrategyCoachInput,
} from "@wod-coach-ai/coach-engine";
import type Anthropic from "@anthropic-ai/sdk";

function textMessage(text: string): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5",
    content: [{ type: "text", text, citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 10,
      output_tokens: 10,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      server_tool_use: null,
      service_tier: null,
    },
  } as unknown as Anthropic.Message;
}

const VALID_STRATEGY = {
  recommendedIntensity: 8,
  targetRpe: 8,
  loadRecommendation: null,
  pacing: "Ritmo controlado no início, acelerar nos últimos 3 minutos.",
  breakStrategy: [{ movement: "Toes to Bar", strategy: "5 + 5 desde o início." }],
  restStrategy: "Descansos curtos entre rodadas.",
  movementStrategy: [{ movement: "Wall Ball", strategy: "Unbroken." }],
  transitionStrategy: "Minimizar tempo parado.",
  energyManagement: "Controlar esforço no início.",
  goal: "Manter consistência.",
  target: "8-9 rounds",
  criticalPoint: "Grip",
  warnings: [],
  confidence: 0.85,
};

const MINIMAL_INPUT: StrategyCoachInput = {
  wodAnalysis: {
    format: "AMRAP",
    durationMinutes: 15,
    stimulus: "mixed_modal",
    movements: [{ name: "Toes to Bar", category: "gymnastics" }],
    estimatedDemand: { engine: 8, grip: 7, legs: 7, gymnastics: 6, technical: 5 },
    estimatedIntensity: 8,
    confidence: 0.9,
    warnings: [],
  },
  athleteContext: {
    trainingLoad: {
      last7Days: { days: 7, sessionCount: 2, averageRpe: 8, averageReadiness: 70 },
      last14Days: { days: 14, sessionCount: 4, averageRpe: 7.5, averageReadiness: 68 },
      last28Days: { days: 28, sessionCount: 8, averageRpe: 7.5, averageReadiness: 65 },
    },
    readinessTrend: "stable",
    similarWods: [],
    relevantPersonalRecords: [],
    dataSufficiency: "moderate",
  },
  checkin: {
    readinessScore: 75,
    readinessBand: "high",
    cautionFlags: [],
    sleep: 8,
    energy: 7,
    stress: 3,
    muscleSoreness: 3,
    jointPain: 1,
    motivation: 8,
  },
  athleteProfile: {
    level: "INTERMEDIATE",
    goals: ["performance"],
    injuries: [],
    limitedMovements: [],
    weeklyFrequency: 5,
  },
};

describe("generateStrategy", () => {
  it("parses and validates a well-formed strategy on the first attempt", async () => {
    const sendMessage: SendMessage = vi
      .fn()
      .mockResolvedValue(textMessage(JSON.stringify(VALID_STRATEGY)));

    const result = await generateStrategy(MINIMAL_INPUT, sendMessage);

    expect(result.recommendedIntensity).toBe(8);
    expect(result.criticalPoint).toBe("Grip");
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("retries once when the first response fails validation, then succeeds", async () => {
    const invalid = { ...VALID_STRATEGY, recommendedIntensity: 99 };
    const sendMessage: SendMessage = vi
      .fn()
      .mockResolvedValueOnce(textMessage(JSON.stringify(invalid)))
      .mockResolvedValueOnce(textMessage(JSON.stringify(VALID_STRATEGY)));

    const result = await generateStrategy(MINIMAL_INPUT, sendMessage);

    expect(result.recommendedIntensity).toBe(8);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it("throws StrategyGenerationError without returning invalid data after exhausting retries", async () => {
    const sendMessage: SendMessage = vi.fn().mockResolvedValue(textMessage("not json"));

    await expect(generateStrategy(MINIMAL_INPUT, sendMessage)).rejects.toBeInstanceOf(
      StrategyGenerationError,
    );
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });
});
