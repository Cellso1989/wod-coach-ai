import type Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";

/**
 * Shared plumbing for agents that ask Claude for structured JSON
 * (WodAnalyzerAgent, StrategyCoachAgent, ...): send a message, extract
 * the text, strip stray markdown fences, validate with Zod, and retry
 * once with a corrective follow-up if the response doesn't parse or
 * validate. Never returns (or lets the caller persist) data that
 * failed validation (seção 30).
 */

export const DEFAULT_AI_MODEL = "claude-opus-5";

/**
 * Thin seam over the Anthropic SDK call so agent parsing/retry logic
 * can be unit tested without spending real API credits.
 */
export type SendMessage = (
  params: Anthropic.MessageCreateParamsNonStreaming,
) => Promise<Anthropic.Message>;

export class AiJsonError extends Error {
  constructor(
    message: string,
    public readonly rawResponse?: string,
  ) {
    super(message);
  }
}

function extractJsonText(message: Anthropic.Message): string {
  const textBlock = message.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text",
  );
  if (!textBlock) {
    throw new AiJsonError("A resposta da IA não contém um bloco de texto");
  }
  return textBlock.text;
}

function parseAndValidate<S extends z.ZodTypeAny>(schema: S, rawText: string): z.output<S> {
  let parsedJson: unknown;
  try {
    // Remove eventuais cercas de código, caso a IA as inclua por engano.
    const stripped = rawText.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    parsedJson = JSON.parse(stripped);
  } catch {
    throw new AiJsonError("Resposta da IA não é um JSON válido", rawText);
  }

  const result = schema.safeParse(parsedJson);
  if (!result.success) {
    throw new AiJsonError(`Resposta da IA não passou na validação: ${result.error.message}`, rawText);
  }

  return result.data;
}

export interface CallAiForJsonParams<S extends z.ZodTypeAny> {
  schema: S;
  systemPrompt: string;
  userContent: Anthropic.MessageParam["content"];
  sendMessage: SendMessage;
  model?: string;
  maxTokens?: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  maxAttempts?: number;
}

export async function callAiForJson<S extends z.ZodTypeAny>(
  params: CallAiForJsonParams<S>,
): Promise<z.output<S>> {
  const maxAttempts = params.maxAttempts ?? 2;
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: params.userContent }];

  let lastError: AiJsonError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const message = await params.sendMessage({
      model: params.model ?? DEFAULT_AI_MODEL,
      max_tokens: params.maxTokens ?? 4096,
      system: params.systemPrompt,
      messages,
      output_config: { effort: params.effort ?? "medium" },
    } as Anthropic.MessageCreateParamsNonStreaming);

    const rawText = extractJsonText(message);

    try {
      return parseAndValidate(params.schema, rawText);
    } catch (err) {
      lastError = err instanceof AiJsonError ? err : new AiJsonError(String(err));

      if (attempt < maxAttempts) {
        messages.push({ role: "assistant", content: rawText });
        messages.push({
          role: "user",
          content: `Sua resposta anterior não era um JSON válido no formato exigido (${lastError.message}). Responda novamente APENAS com o JSON correto, sem nenhum outro texto.`,
        });
      }
    }
  }

  throw lastError ?? new AiJsonError("Falha desconhecida ao chamar a IA");
}
