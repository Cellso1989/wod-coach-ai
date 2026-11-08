import { createHash } from 'node:crypto';
import type { AiTextMessage, AiTokenUsage, SendMessageParams } from '@wod-coach-ai/ai';

interface AiGenerationAttempt {
  attempt: number;
  durationMs: number;
  requestedModel: string;
  model: string | null;
  responseId: string | null;
  promptVersion: string;
  requestedReasoningEffort: SendMessageParams['effort'];
  maxOutputTokens: number;
  usage: AiTokenUsage | null;
}

export interface AiAttemptTiming {
  durationMs: number;
  status: 'received' | 'failed';
  requestedModel: string;
  requestedReasoningEffort: SendMessageParams['effort'];
  maxOutputTokens: number;
  promptVersion: string;
  model: string | null;
  usage: AiTokenUsage | null;
}

export interface AiGenerationMetadata {
  schemaVersion: 1;
  provider: 'openai';
  agent: 'WodAnalyzerAgent' | 'StrategyCoachAgent';
  attempts: AiGenerationAttempt[];
  totalUsage: AiTokenUsage | null;
}

export function captureAiGeneration(
  sendMessage: (params: SendMessageParams) => Promise<AiTextMessage>,
  agent: AiGenerationMetadata['agent'],
  onAttempt?: (attempt: AiAttemptTiming) => void,
) {
  const attempts: AiGenerationAttempt[] = [];
  function observe(attempt: AiAttemptTiming) {
    try {
      onAttempt?.(attempt);
    } catch {
      // Instrumentation cannot reject a valid response or mask a transport failure.
    }
  }
  return {
    async sendMessage(params: SendMessageParams): Promise<AiTextMessage> {
      const started = performance.now();
      const details = {
        requestedModel: params.model,
        requestedReasoningEffort: params.effort,
        maxOutputTokens: params.maxTokens,
        promptVersion: `sha256:${createHash('sha256').update(params.systemPrompt).digest('hex')}`,
      };
      let message: AiTextMessage;
      try {
        message = await sendMessage(params);
      } catch (error) {
        observe({
          durationMs: performance.now() - started,
          status: 'failed',
          ...details,
          model: null,
          usage: null,
        });
        throw error;
      }
      const durationMs = performance.now() - started;
      attempts.push({
        attempt: attempts.length + 1,
        durationMs,
        ...details,
        model: message.metadata?.model ?? null,
        responseId: message.metadata?.responseId ?? null,
        usage: message.metadata?.usage ? { ...message.metadata.usage } : null,
      });
      observe({
        durationMs,
        status: 'received',
        ...details,
        model: message.metadata?.model ?? null,
        usage: message.metadata?.usage ? { ...message.metadata.usage } : null,
      });
      return message;
    },
    metadata(): AiGenerationMetadata {
      // Never represent partial reporting as the exact total of a generation.
      const total =
        attempts.length && attempts.every((attempt) => attempt.usage !== null)
          ? attempts.reduce<AiTokenUsage>(
              (sum, attempt) => ({
                inputTokens: sum.inputTokens + attempt.usage!.inputTokens,
                outputTokens: sum.outputTokens + attempt.usage!.outputTokens,
                totalTokens: sum.totalTokens + attempt.usage!.totalTokens,
              }),
              { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            )
          : null;
      return structuredClone({
        schemaVersion: 1,
        provider: 'openai',
        agent,
        attempts,
        totalUsage: total && Object.values(total).every(Number.isSafeInteger) ? total : null,
      });
    },
  };
}
