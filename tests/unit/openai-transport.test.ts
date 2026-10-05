import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createOpenAiMessageSender,
  describeOpenAiApiError,
  type SendMessageParams,
} from '../../packages/ai/src/index.js';

const PARAMS: SendMessageParams = {
  model: 'gpt-5',
  maxTokens: 2500,
  systemPrompt: 'Return JSON.',
  effort: 'low',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'AMRAP 15: 10 T2B' }] }],
};

function respond(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('OpenAI transport completion and deadline', () => {
  it.each(['incomplete', 'failed', 'cancelled', 'queued', 'in_progress', undefined])(
    'rejects status %s even with syntactically valid JSON text',
    async (status) => {
      const fetchMock = respond({
        status,
        output_text: '{"format":"AMRAP"}',
        incomplete_details: status === 'incomplete' ? { reason: 'max_output_tokens' } : null,
      });
      const error = await createOpenAiMessageSender('test-key')(PARAMS).catch(
        (err: unknown) => err,
      );
      expect(describeOpenAiApiError(error)?.status).toBe(502);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    { incomplete_details: { reason: 'content_filter' } },
    { error: { code: 'server_error', message: 'Failed' } },
  ])('rejects contradictory completion metadata: %j', async (details) => {
    respond({ status: 'completed', output_text: '{}', ...details });
    await expect(createOpenAiMessageSender('test-key')(PARAMS)).rejects.toThrow();
  });

  it('accepts completed Responses message output and preserves request options', async () => {
    const fetchMock = respond({
      status: 'completed',
      incomplete_details: null,
      error: null,
      output: [
        {
          type: 'message',
          status: 'completed',
          content: [{ type: 'output_text', text: '{"format":"AMRAP"}' }],
        },
      ],
    });
    expect(await createOpenAiMessageSender('test-key')(PARAMS)).toEqual({
      text: '{"format":"AMRAP"}',
    });
    const options = fetchMock.mock.calls[0][1];
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(options.body)).toMatchObject({
      model: 'gpt-5',
      max_output_tokens: 2500,
      reasoning: { effort: 'low' },
    });
    expect(options.signal.aborted).toBe(false);
  });

  it('aborts a stalled request at the default deadline and does not retry', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetchMock = vi.fn().mockImplementation((_url, options: RequestInit) => {
      signal = options.signal as AbortSignal;
      return new Promise((_resolve, reject) =>
        signal?.addEventListener('abort', () => reject(signal!.reason), { once: true }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const pending = createOpenAiMessageSender('test-key')(PARAMS).catch((err: unknown) => err);
    await vi.advanceTimersByTimeAsync(119_999);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(describeOpenAiApiError(await pending)).toMatchObject({ status: 504 });
    expect(signal!.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the deadline active while reading the response body', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url, options: RequestInit) => ({
        ok: true,
        json: () =>
          new Promise((_resolve, reject) =>
            options.signal!.addEventListener('abort', () => reject(options.signal!.reason), {
              once: true,
            }),
          ),
      })),
    );
    const pending = createOpenAiMessageSender('test-key')(PARAMS).catch((err: unknown) => err);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(describeOpenAiApiError(await pending)).toMatchObject({ status: 504 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up the timer on success and preserves HTTP error handling', async () => {
    vi.useFakeTimers();
    respond({ status: 'completed', output_text: '{}' });
    expect(await createOpenAiMessageSender('test-key')(PARAMS)).toEqual({ text: '{}' });
    expect(vi.getTimerCount()).toBe(0);
    respond({ error: { code: 'rate_limit_exceeded', message: 'Rate limit' } }, 429);
    const error = await createOpenAiMessageSender('test-key')(PARAMS).catch((err: unknown) => err);
    expect(describeOpenAiApiError(error)?.status).toBe(429);
    expect(vi.getTimerCount()).toBe(0);
  });
});
