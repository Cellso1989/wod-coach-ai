import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  callAiForJson,
  type AiValidationObservation,
} from '../../packages/coach-engine/src/ai-json-agent.js';

describe('AI validation observations', () => {
  const schema = z.object({ target: z.string().max(10) });
  function run(texts: string[], events: AiValidationObservation[], options = {}) {
    const sendMessage = vi.fn();
    for (const text of texts) sendMessage.mockResolvedValueOnce({ text });
    return {
      sendMessage,
      result: callAiForJson({
        schema,
        systemPrompt: 'JSON',
        userContent: [],
        sendMessage,
        onValidation: (event) => events.push(event),
        ...options,
      }),
    };
  }

  it('distinguishes rejected JSON, corrective retry and accepted response', async () => {
    const events: AiValidationObservation[] = [];
    const { result, sendMessage } = run(['private invalid JSON', '{"target":"8 min"}'], events);
    expect(await result).toEqual({ target: '8 min' });
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(events).toMatchObject([
      { attempt: 1, status: 'rejected', reason: 'invalid_json', willRetry: true },
      { attempt: 2, status: 'accepted', reason: null, willRetry: false },
    ]);
    expect(JSON.stringify(events)).not.toContain('private');
  });

  it('records bounded schema fields/codes and terminal failure without values or messages', async () => {
    const events: AiValidationObservation[] = [];
    const { result } = run(['{"target":"private athlete data"}', '{}'], events);
    await expect(result).rejects.toThrow();
    expect(events).toMatchObject([
      {
        reason: 'schema',
        issues: [{ field: 'target', code: 'too_big' }],
        issueCount: 1,
        willRetry: true,
      },
      { reason: 'schema', issues: [{ field: 'target', code: 'invalid_type' }], willRetry: false },
    ]);
    expect(JSON.stringify(events)).not.toContain('athlete');
    expect(events.every((e) => e.durationMs >= 0)).toBe(true);
  });

  it('does not add retries for empty responses or transport errors', async () => {
    const events: AiValidationObservation[] = [];
    const { result, sendMessage } = run([''], events);
    await expect(result).rejects.toThrow();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(events).toMatchObject([{ reason: 'empty_response', willRetry: false }]);
    const observer = vi.fn();
    const failed = vi.fn().mockRejectedValue(new Error('transport'));
    await expect(
      callAiForJson({
        schema,
        systemPrompt: '',
        userContent: [],
        sendMessage: failed,
        onValidation: observer,
      }),
    ).rejects.toThrow('transport');
    expect(failed).toHaveBeenCalledTimes(1);
    expect(observer).not.toHaveBeenCalled();
  });

  it('preserves explicit attempt limits and ignores a broken observer', async () => {
    const events: AiValidationObservation[] = [];
    const { result, sendMessage } = run(['{}'], events, { maxAttempts: 1 });
    await expect(result).rejects.toThrow();
    expect(events[0]?.willRetry).toBe(false);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const good = run(['{"target":"8 min"}'], [], {
      onValidation: () => {
        throw new Error('logger');
      },
    });
    expect(await good.result).toEqual({ target: '8 min' });
  });

  it('never copies dynamic property names or semantic validation messages', async () => {
    const observer = vi.fn();
    const privateSchema = z.record(z.string()).superRefine((_value, ctx) => {
      for (let i = 0; i < 30; i++)
        ctx.addIssue({ code: 'custom', path: ['Private name'], message: 'Private value' });
    });
    await expect(
      callAiForJson({
        schema: privateSchema,
        systemPrompt: '',
        userContent: [],
        sendMessage: vi.fn().mockResolvedValue({ text: '{}' }),
        onValidation: observer,
        maxAttempts: 1,
      }),
    ).rejects.toThrow();
    const event = observer.mock.calls[0]![0];
    expect(event.issueCount).toBe(30);
    expect(event.issues).toHaveLength(12);
    expect(event.issues[0]).toEqual({ field: 'other', code: 'custom' });
    expect(JSON.stringify(event)).not.toContain('Private');
  });
});
