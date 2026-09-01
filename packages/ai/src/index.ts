/**
 * Thin Claude API client wrapper. Agent-specific prompts and Zod
 * validation of AI output live in @wod-coach-ai/coach-engine and
 * are added starting Fase 5.
 */
import Anthropic from "@anthropic-ai/sdk";

export function createAnthropicClient(apiKey: string = process.env.ANTHROPIC_API_KEY ?? ""): Anthropic {
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  return new Anthropic({ apiKey });
}
