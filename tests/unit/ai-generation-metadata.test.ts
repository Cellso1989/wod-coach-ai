import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureAiGeneration } from '../../apps/api/src/services/ai-generation-metadata.js';
import type { SendMessageParams } from '@wod-coach-ai/ai';

const PARAMS: SendMessageParams = {
  model: 'gpt-5-mini',
  maxTokens: 2500,
  systemPrompt: 'Analyze the WOD.',
  effort: 'low',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Private athlete data' }] }],
};
const MESSAGE = {
  text: '{}',
  metadata: {
    model: 'gpt-5-mini-snapshot',
    responseId: 'resp-1',
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  },
};
afterEach(() => vi.restoreAllMocks());

describe('AI generation metadata collector', () => {
  it('archives successful attempt durations and reports failed attempts without inventing usage', async () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const observer = vi.fn();
    const failure = new Error('provider timeout');
    const send = vi
      .fn()
      .mockImplementationOnce(async () => {
        now = 25;
        return MESSAGE;
      })
      .mockImplementationOnce(async () => {
        now = 75;
        throw failure;
      });
    const generation = captureAiGeneration(send, 'StrategyCoachAgent', observer);
    await generation.sendMessage(PARAMS);
    await expect(generation.sendMessage(PARAMS)).rejects.toBe(failure);
    expect(generation.metadata().attempts).toHaveLength(1);
    expect(generation.metadata().attempts[0].durationMs).toBe(25);
    expect(observer.mock.calls).toMatchObject([
      [{ durationMs: 25, status: 'received' }],
      [{ durationMs: 50, status: 'failed' }],
    ]);
    expect(observer.mock.calls[0]![0]).toMatchObject({
      requestedModel: 'gpt-5-mini',
      requestedReasoningEffort: 'low',
      maxOutputTokens: 2500,
      usage: MESSAGE.metadata.usage,
    });
    expect(observer.mock.calls[1]![0].usage).toBeNull();
    expect(JSON.stringify(observer.mock.calls)).not.toContain('Private athlete data');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('does not let an observer failure reject a response or replace a transport error', async () => {
    const failObserver = () => {
      throw new Error('logger');
    };
    const success = captureAiGeneration(
      vi.fn().mockResolvedValue(MESSAGE),
      'WodAnalyzerAgent',
      failObserver,
    );
    expect(await success.sendMessage(PARAMS)).toBe(MESSAGE);
    const error = new Error('transport');
    const failed = captureAiGeneration(
      vi.fn().mockRejectedValue(error),
      'WodAnalyzerAgent',
      failObserver,
    );
    await expect(failed.sendMessage(PARAMS)).rejects.toBe(error);
  });
  it('does not substitute the requested model or zero tokens for unknown provider data', async () => {
    const sender = vi.fn().mockResolvedValue({ text: '{}' });
    const generation = captureAiGeneration(sender, 'WodAnalyzerAgent');
    expect(generation.metadata().totalUsage).toBeNull();
    await generation.sendMessage(PARAMS);
    expect(generation.metadata()).toMatchObject({
      attempts: [
        {
          requestedModel: 'gpt-5-mini',
          model: null,
          responseId: null,
          usage: null,
          maxOutputTokens: 2500,
          requestedReasoningEffort: 'low',
        },
      ],
      totalUsage: null,
    });
  });

  it('keeps partial usage separate instead of reporting it as the full generation total', async () => {
    const sender = vi.fn().mockResolvedValueOnce(MESSAGE).mockResolvedValueOnce({ text: '{}' });
    const generation = captureAiGeneration(sender, 'StrategyCoachAgent');
    await generation.sendMessage(PARAMS);
    await generation.sendMessage(PARAMS);
    expect(generation.metadata()).toMatchObject({
      attempts: [{ usage: MESSAGE.metadata.usage }, { usage: null }],
      totalUsage: null,
    });
  });

  it('changes the prompt version only when the system prompt changes and does not archive user content', async () => {
    const generation = captureAiGeneration(vi.fn().mockResolvedValue(MESSAGE), 'WodAnalyzerAgent');
    await generation.sendMessage(PARAMS);
    await generation.sendMessage({
      ...PARAMS,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Another athlete' }] }],
    });
    await generation.sendMessage({ ...PARAMS, systemPrompt: 'Another prompt.' });
    const metadata = generation.metadata();
    expect(metadata.attempts[0].promptVersion).toBe(metadata.attempts[1].promptVersion);
    expect(metadata.attempts[0].promptVersion).not.toBe(metadata.attempts[2].promptVersion);
    expect(metadata.totalUsage).toEqual({ inputTokens: 30, outputTokens: 15, totalTokens: 45 });
    expect(JSON.stringify(metadata)).not.toContain('Private athlete data');
    expect(JSON.stringify(metadata)).not.toContain('Analyze the WOD.');
  });

  it('keeps captured usage and returned snapshots isolated from later mutations', async () => {
    const message = structuredClone(MESSAGE);
    const generation = captureAiGeneration(vi.fn().mockResolvedValue(message), 'WodAnalyzerAgent');
    await generation.sendMessage(PARAMS);
    message.metadata.usage.inputTokens = 999;
    const first = generation.metadata();
    first.attempts[0].usage!.inputTokens = 999;
    first.attempts.length = 0;
    expect(generation.metadata()).toMatchObject({
      attempts: [{ usage: { inputTokens: 10 } }],
      totalUsage: { inputTokens: 10 },
    });
  });

  it('does not add automatic retries or a successful attempt for a rejected request', async () => {
    const sender = vi.fn().mockRejectedValue(new Error('Timeout'));
    const generation = captureAiGeneration(sender, 'WodAnalyzerAgent');
    await expect(generation.sendMessage(PARAMS)).rejects.toThrow('Timeout');
    expect(sender).toHaveBeenCalledTimes(1);
    expect(generation.metadata()).toMatchObject({ attempts: [], totalUsage: null });
  });

  it('keeps a total that exceeds the safe integer range unknown', async () => {
    const sender = vi.fn().mockResolvedValue({
      text: '{}',
      metadata: {
        ...MESSAGE.metadata,
        usage: {
          inputTokens: Number.MAX_SAFE_INTEGER,
          outputTokens: 0,
          totalTokens: Number.MAX_SAFE_INTEGER,
        },
      },
    });
    const generation = captureAiGeneration(sender, 'WodAnalyzerAgent');
    await generation.sendMessage(PARAMS);
    await generation.sendMessage(PARAMS);
    expect(generation.metadata().totalUsage).toBeNull();
  });
});
