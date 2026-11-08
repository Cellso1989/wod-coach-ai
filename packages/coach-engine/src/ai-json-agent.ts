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

export interface AiValidationObservation {
  attempt: number;
  status: 'accepted' | 'rejected';
  reason: 'invalid_json' | 'schema' | 'empty_response' | null;
  issues: Array<{ field: string; code: string }>;
  issueCount: number;
  willRetry: boolean;
  durationMs: number;
}

export type AiValidationObserver = (event: AiValidationObservation) => void;

// Never put arbitrary JSON keys, validation messages or athlete values in telemetry.
const OBSERVED_FIELDS = new Set([
  'format',
  'durationMinutes',
  'targetMinutes',
  'stimulus',
  'movements',
  'rounds',
  'estimatedDemand',
  'estimatedIntensity',
  'confidence',
  'warnings',
  'extractedText',
  'recommendedIntensity',
  'targetRpe',
  'loadRecommendation',
  'loadCalculations',
  'pacing',
  'breakStrategy',
  'restStrategy',
  'movementStrategy',
  'transitionStrategy',
  'energyManagement',
  'goal',
  'target',
  'criticalPoint',
]);

function observeValidation(
  observer: AiValidationObserver | undefined,
  event: AiValidationObservation,
) {
  try {
    observer?.(event);
  } catch {
    // Diagnostics must never change generation, validation or retry behavior.
  }
}

export class AiJsonError extends Error {
  constructor(
    message: string,
    public readonly rawResponse?: string,
    public readonly validation?: Pick<AiValidationObservation, 'reason' | 'issues' | 'issueCount'>,
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
    throw new AiJsonError('Resposta da IA nao e um JSON valido', rawText, {
      reason: 'invalid_json',
      issues: [],
      issueCount: 0,
    });
  }

  const result = schema.safeParse(parsedJson);
  if (!result.success) {
    throw new AiJsonError(
      `Resposta da IA nao passou na validacao: ${result.error.message}`,
      rawText,
      {
        reason: 'schema',
        issueCount: result.error.issues.length,
        issues: result.error.issues.slice(0, 12).map((issue) => ({
          field: OBSERVED_FIELDS.has(String(issue.path[0])) ? String(issue.path[0]) : 'other',
          code: issue.code,
        })),
      },
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
  onValidation?: AiValidationObserver;
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

    const validationStarted = performance.now();
    let rawText: string;
    try {
      rawText = extractJsonText(message);
    } catch (error) {
      observeValidation(params.onValidation, {
        attempt,
        status: 'rejected',
        reason: 'empty_response',
        issues: [],
        issueCount: 0,
        willRetry: false,
        durationMs: performance.now() - validationStarted,
      });
      throw error;
    }

    try {
      const result = parseAndValidate(params.schema, rawText);
      observeValidation(params.onValidation, {
        attempt,
        status: 'accepted',
        reason: null,
        issues: [],
        issueCount: 0,
        willRetry: false,
        durationMs: performance.now() - validationStarted,
      });
      return result;
    } catch (err) {
      lastError = err instanceof AiJsonError ? err : new AiJsonError(String(err));
      observeValidation(params.onValidation, {
        attempt,
        status: 'rejected',
        reason: lastError.validation?.reason ?? 'schema',
        issues: lastError.validation?.issues ?? [],
        issueCount: lastError.validation?.issueCount ?? 0,
        willRetry: attempt < maxAttempts,
        durationMs: performance.now() - validationStarted,
      });

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
