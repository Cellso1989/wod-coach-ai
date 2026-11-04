import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionReadCache } from '../../apps/web/src/lib/session-read-cache.js';

function gate<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(() => vi.useRealTimers());

describe('session navigation reads', () => {
  it('shares an in-flight read without letting one departing screen cancel another', async () => {
    const cache = new SessionReadCache();
    cache.setSession('a');
    const pending = gate<{ rows: string[] }>();
    const load = vi.fn((_signal?: AbortSignal) => pending.promise);
    const departing = new AbortController();
    const first = cache.read('list', load, 15000, departing.signal);
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    const second = cache.read('list', load, 15000);
    departing.abort();
    pending.resolve({ rows: ['a'] });
    await rejected;
    expect(await second).toEqual({ rows: ['a'] });
    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0]?.[0]?.aborted).not.toBe(true);
  });

  it('returns independent data and expires from completion without extending on reads', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const cache = new SessionReadCache();
    cache.setSession('a');
    const load = vi.fn(async () => ({ rows: [{ name: 'Original' }] }));
    const first = await cache.read('list', load, 15000);
    first.rows[0]!.name = 'Edited locally';
    vi.setSystemTime(Date.now() + 14000);
    expect((await cache.read('list', load, 15000)).rows[0]!.name).toBe('Original');
    vi.setSystemTime(Date.now() + 1000);
    await cache.read('list', load, 15000);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('never stores failed reads and allows a real retry', async () => {
    const cache = new SessionReadCache();
    cache.setSession('a');
    const load = vi.fn().mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue('ok');
    await expect(cache.read('list', load, 15000)).rejects.toThrow('Unavailable');
    expect(await cache.read('list', load, 15000)).toBe('ok');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it.each(['clear', 'account', 'logout'] as const)(
    'discards late reads after %s',
    async (action) => {
      const cache = new SessionReadCache();
      cache.setSession('a');
      const pending = gate<string>();
      const old = cache.read('list', () => pending.promise, 15000);
      const rejected = expect(old).rejects.toMatchObject({ name: 'AbortError' });
      if (action === 'clear') cache.clear();
      else cache.setSession(action === 'logout' ? null : 'b');
      pending.resolve('private old account data');
      await rejected;
      expect(await cache.read('list', async () => 'new', 15000)).toBe('new');
    },
  );

  it('does not reuse responses until a session is established', async () => {
    const cache = new SessionReadCache();
    const load = vi.fn(async () => 'data');
    await cache.read('list', load, 15000);
    await cache.read('list', load, 15000);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not send an already cancelled read or serve cached data to it', async () => {
    const cache = new SessionReadCache();
    cache.setSession('a');
    const load = vi.fn(async () => 'data');
    await cache.read('list', load, 15000);
    const controller = new AbortController();
    controller.abort();
    await expect(cache.read('list', load, 15000, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(load).toHaveBeenCalledTimes(1);
  });
});
