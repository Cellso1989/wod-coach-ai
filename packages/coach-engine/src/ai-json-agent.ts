import type { z } from 'zod';

/**
 * Shared plumbing for agents that ask an AI model for structured JSON
 * (WodAnalyzerAgent, StrategyCoachAgent, ...): send a message, extract
 * the text, strip stray markdown fences, validate with Zod, and retry
 * once with a corrective follow-up if the response doesn't parse or
 * validate. Never returns (or lets the caller persist) data that
 * failed validation (secao 30).
 */

export const DEFAULT_AI_MODEL = 'gpt-5';

export type AiMessageContent = Array<
  { type: 'text'; text: string } | { type: 'image'; imageBase64: string; imageMimeType: string }
>;

export interface AiMessage {
  role: 'user';
  content: AiMessageContent;
}

export interface SendMessageParams {
  model: string;
  maxTokens: number;
  systemPrompt: string;
  messages: AiMessage[];
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}

export interface AiTextMessage {
  text: string;
}

/**
 * Thin seam over the AI provider call so agent parsing/retry logic
 * can be unit tested without spending real API credits.
 */
export type SendMessage = (params: SendMessageParams) => Promise<AiTextMessage>;

export class AiJsonError extends Error {
  constructor(
    message: string,
    public readonly rawResponse?: string,
  ) {
    super(message);
  }
}

function extractJsonText(message: AiTextMessage): string {
  if (!message.text) {
    throw new AiJsonError('A resposta da IA nao contem um bloco de texto');
  }
  return message.text;
}

function parseAndValidate<S extends z.ZodTypeAny>(schema: S, rawText: string): z.output<S> {
  let parsedJson: unknown;
  try {
    // Remove eventuais cercas de codigo, caso a IA as inclua por engano.
    const stripped = rawText
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '');
    parsedJson = JSON.parse(stripped);
  } catch {
    throw new AiJsonError('Resposta da IA nao e um JSON valido', rawText);
  }

  const result = schema.safeParse(parsedJson);
  if (!result.success) {
    throw new AiJsonError(
      `Resposta da IA nao passou na validacao: ${result.error.message}`,
      rawText,
    );
  }

  return result.data;
}

export interface CallAiForJsonParams<S extends z.ZodTypeAny> {
  schema: S;
  systemPrompt: string;
  userContent: AiMessageContent;
  sendMessage: SendMessage;
  model?: string;
  maxTokens?: number;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  maxAttempts?: number;
}

export async function callAiForJson<S extends z.ZodTypeAny>(
  params: CallAiForJsonParams<S>,
): Promise<z.output<S>> {
  const maxAttempts = params.maxAttempts ?? 2;
  const messages: AiMessage[] = [{ role: 'user', content: params.userContent }];

  let lastError: AiJsonError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const message = await params.sendMessage({
      model: params.model ?? DEFAULT_AI_MODEL,
      maxTokens: params.maxTokens ?? 4096,
      systemPrompt: params.systemPrompt,
      messages,
      effort: params.effort ?? 'medium',
    });

    const rawText = extractJsonText(message);

    try {
      return parseAndValidate(params.schema, rawText);
    } catch (err) {
      lastError = err instanceof AiJsonError ? err : new AiJsonError(String(err));

      if (attempt < maxAttempts) {
        messages.push({
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Sua resposta anterior nao era um JSON valido no formato exigido (${lastError.message}). Resposta anterior:\n\n${rawText}\n\nResponda novamente APENAS com o JSON correto, sem nenhum outro texto.`,
            },
          ],
        });
      }
    }
  }

  throw lastError ?? new AiJsonError('Falha desconhecida ao chamar a IA');
}
