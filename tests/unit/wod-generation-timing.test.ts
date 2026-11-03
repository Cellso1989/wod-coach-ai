import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { observeWodGeneration } from '../../apps/api/src/services/wod-generation-timing.js';

afterEach(() => vi.restoreAllMocks());

describe('WOD generation timings', () => {
  function setup() {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const info = vi.fn();
    const request = { log: { info } } as unknown as FastifyRequest;
    const reply = { statusCode: 200 } as FastifyReply;
    return {
      timing: observeWodGeneration(request, reply, 'ANALYSIS'),
      info,
      reply,
      advance: (ms: number) => {
        now += ms;
      },
    };
  }

  it('measures complete work including cleanup, with individual attempts and source type', async () => {
    const { timing, info, advance } = setup();
    timing.setSourceType('IMAGE');
    const result = await timing.run(async () => {
      await timing.measure('sourceRead', async () => {
        advance(12);
      });
      await timing.measure('ai', async () => {
        advance(80);
        timing.recordAttempt({ durationMs: 80, status: 'received' });
        advance(20);
        timing.recordAttempt({ durationMs: 20, status: 'received' });
      });
      advance(5); // Reservation cleanup is included in total duration.
      return 'persisted';
    });
    expect(result).toBe('persisted');
    expect(info.mock.calls[0][0]).toEqual({
      event: 'wod_generation_timing',
      operation: 'ANALYSIS',
      sourceType: 'IMAGE',
      statusCode: 200,
      outcome: 'succeeded',
      durationMs: 117,
      stages: { sourceRead: 12, ai: 100 },
      attempts: [
        { durationMs: 80, status: 'received' },
        { durationMs: 20, status: 'received' },
      ],
    });
  });

  it('records failed phases and rethrows the same error without logging its contents', async () => {
    const { timing, info, advance } = setup();
    const error = new Error('Private athlete data');
    await expect(
      timing.run(() =>
        timing.measure('context', async () => {
          advance(30);
          throw error;
        }),
      ),
    ).rejects.toBe(error);
    expect(info.mock.calls[0][0]).toMatchObject({
      statusCode: null,
      outcome: 'failed',
      durationMs: 30,
      stages: { context: 30 },
    });
    expect(JSON.stringify(info.mock.calls)).not.toContain(error.message);
  });

  it('records handled failures as failures, even when no exception escapes', async () => {
    const { timing, info, reply } = setup();
    await timing.run(async () => {
      reply.statusCode = 502;
      return { error: 'Invalid JSON' };
    });
    expect(info.mock.calls[0][0]).toMatchObject({ statusCode: 502, outcome: 'failed' });
  });
});
