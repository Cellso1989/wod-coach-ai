import { describe, it, expect, vi } from "vitest";
import { analyzeWod, WodAnalysisError, type SendMessage } from "@wod-coach-ai/coach-engine";
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

const VALID_OUTPUT = {
  format: "AMRAP",
  durationMinutes: 15,
  stimulus: "mixed_modal",
  movements: [
    { name: "Toes to Bar", category: "gymnastics", reps: 10 },
    { name: "Wall Ball", category: "conditioning", reps: 15 },
    { name: "Run", category: "monostructural", distanceMeters: 200 },
  ],
  estimatedDemand: { engine: 8, grip: 7, legs: 7, gymnastics: 6, technical: 5 },
  estimatedIntensity: 8,
  confidence: 0.9,
  warnings: [],
};

describe("analyzeWod", () => {
  it("parses and validates a well-formed JSON response on the first attempt", async () => {
    const sendMessage: SendMessage = vi.fn().mockResolvedValue(textMessage(JSON.stringify(VALID_OUTPUT)));

    const result = await analyzeWod({ rawText: "15 min AMRAP..." }, sendMessage);

    expect(result.format).toBe("AMRAP");
    expect(result.movements).toHaveLength(3);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("strips markdown code fences before parsing", async () => {
    const fenced = "```json\n" + JSON.stringify(VALID_OUTPUT) + "\n```";
    const sendMessage: SendMessage = vi.fn().mockResolvedValue(textMessage(fenced));

    const result = await analyzeWod({ rawText: "15 min AMRAP..." }, sendMessage);

    expect(result.confidence).toBe(0.9);
  });

  it("retries once when the first response is not valid JSON, then succeeds", async () => {
    const sendMessage: SendMessage = vi
      .fn()
      .mockResolvedValueOnce(textMessage("not json at all"))
      .mockResolvedValueOnce(textMessage(JSON.stringify(VALID_OUTPUT)));

    const result = await analyzeWod({ rawText: "15 min AMRAP..." }, sendMessage);

    expect(result.format).toBe("AMRAP");
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it("throws WodAnalysisError without ever returning invalid data after exhausting retries", async () => {
    const sendMessage: SendMessage = vi.fn().mockResolvedValue(textMessage("still not json"));

    await expect(analyzeWod({ rawText: "15 min AMRAP..." }, sendMessage)).rejects.toBeInstanceOf(
      WodAnalysisError,
    );
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it("rejects a response that fails schema validation (e.g. demand out of range)", async () => {
    const invalid = { ...VALID_OUTPUT, estimatedDemand: { ...VALID_OUTPUT.estimatedDemand, engine: 99 } };
    const sendMessage: SendMessage = vi.fn().mockResolvedValue(textMessage(JSON.stringify(invalid)));

    await expect(analyzeWod({ rawText: "15 min AMRAP..." }, sendMessage)).rejects.toBeInstanceOf(
      WodAnalysisError,
    );
  });

  it("throws before calling the API when neither text nor image is provided", async () => {
    const sendMessage: SendMessage = vi.fn();

    await expect(analyzeWod({}, sendMessage)).rejects.toBeInstanceOf(WodAnalysisError);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
