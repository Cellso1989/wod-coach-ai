import { createHash } from 'node:crypto';
import type { AiTextMessage, AiTokenUsage, SendMessageParams } from '@wod-coach-ai/ai';

interface AiGenerationAttempt {
  attempt: number;
  requestedModel: string;
  model: string | null;
  responseId: string | null;
  promptVersion: string;
  requestedReasoningEffort: SendMessageParams['effort'];
  maxOutputTokens: number;
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
) {
  const attempts: AiGenerationAttempt[] = [];
  return {
    async sendMessage(params: SendMessageParams): Promise<AiTextMessage> {
      const message = await sendMessage(params);
      attempts.push({
        attempt: attempts.length + 1,
        requestedModel: params.model,
        model: message.metadata?.model ?? null,
        responseId: message.metadata?.responseId ?? null,
        // Content-addressed system prompt version, independent of athlete data.
        promptVersion: `sha256:${createHash('sha256').update(params.systemPrompt).digest('hex')}`,
        requestedReasoningEffort: params.effort,
        maxOutputTokens: params.maxTokens,
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
