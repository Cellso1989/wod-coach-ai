import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { api, setApiReadSession } from '../../apps/web/src/lib/api.js';
const fetchMock = vi.fn();
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
beforeEach(() => {
  vi.useFakeTimers();
  setApiReadSession('owner');
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  setApiReadSession(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('durable generation client', () => {
  it('waits through queued/running states and invalidates reads after success', async () => {
    let polls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/strategy')) return response({ queued: true, jobId: 'job' });
      if (url.includes('/wod-generation-jobs/'))
        return response(
          ++polls === 1
            ? { status: 'RUNNING' }
            : { status: 'SUCCEEDED', statusCode: 200, result: { strategy: { goal: 'fixture' } } },
        );
      return response({ wods: [] });
    });
    await api.listWods(20);
    const generating = api.generateStrategy('wod');
    await vi.advanceTimersByTimeAsync(2100);
    expect(await generating).toEqual({ strategy: { goal: 'fixture' } });
    expect(polls).toBe(2);
    await api.listWods(20);
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('/wods?limit=')),
    ).toHaveLength(2);
    expect(
      fetchMock.mock.calls.find(([url]) => String(url).endsWith('/strategy'))![1].headers,
    ).toMatchObject({ 'X-Wod-Async': '1' });
  });
  it('never polls a queued job under a replacement account', async () => {
    fetchMock.mockResolvedValue(response({ queued: true, jobId: 'job' }));
    const generating = api.generateStrategy('wod');
    const rejected = expect(generating).rejects.toThrow('A conta mudou');
    await vi.advanceTimersByTimeAsync(0);
    setApiReadSession('other');
    await vi.advanceTimersByTimeAsync(1100);
    await rejected;
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('/wod-generation-jobs/')),
    ).toHaveLength(0);
  });
  it('surfaces a terminal failure without posting a second paid request', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      response(
        url.endsWith('/strategy')
          ? { queued: true, jobId: 'job' }
          : { status: 'FAILED', statusCode: 502, result: { error: 'Fixture failure' } },
      ),
    );
    const generating = api.generateStrategy('wod');
    const rejected = expect(generating).rejects.toThrow('Fixture failure');
    await vi.advanceTimersByTimeAsync(1100);
    await rejected;
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/strategy'))).toHaveLength(
      1,
    );
  });
});
