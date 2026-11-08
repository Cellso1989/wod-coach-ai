import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, setApiReadSession } from '../../apps/web/src/lib/api.js';

const fetchMock = vi.fn();
const measurementId = '6df01b70-31e6-4db3-9a0c-7fb09ec9dd94';
beforeEach(() => {
  setApiReadSession('athlete');
  vi.stubGlobal('crypto', { randomUUID: () => measurementId });
  vi.stubGlobal('fetch', fetchMock);
  fetchMock
    .mockReset()
    .mockImplementation(async (url: string) =>
      url.endsWith('/wod-generation-metrics')
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify({ analysis: {}, strategy: {} })),
    );
});
afterEach(() => {
  setApiReadSession(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('CrossFit browser timing', () => {
  it.each(['ANALYSIS', 'STRATEGY'] as const)(
    'correlates %s without sending workout data',
    async (operation) => {
      if (operation === 'ANALYSIS') await api.analyzeWod('private-workout');
      else await api.generateStrategy('private-workout');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0]![1].headers['X-Wod-Measurement-Id']).toBe(measurementId);
      const metric = JSON.parse(fetchMock.mock.calls[1]![1].body);
      expect(metric).toEqual({
        measurementId,
        operation,
        durationMs: expect.any(Number),
        outcome: 'succeeded',
      });
      expect(JSON.stringify(metric)).not.toContain('private');
    },
  );

  it('reports a generation error and ignores telemetry rejection', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('{"error":"Try later"}', { status: 502 }))
      .mockRejectedValueOnce(new Error('telemetry failed'));
    await expect(api.analyzeWod('wod')).rejects.toThrow('Try later');
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body).outcome).toBe('failed');
  });

  it('does not wait for telemetry before returning a valid result', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('{"strategy":{"target":"8 min"}}'))
      .mockReturnValueOnce(new Promise(() => undefined));
    expect(await api.generateStrategy('wod')).toEqual({ strategy: { target: '8 min' } });
  });

  it.each(['logout', 'switch-and-return', 'denied'] as const)(
    'drops metrics after %s',
    async (change) => {
      fetchMock.mockImplementationOnce(async () => {
        if (change === 'logout') setApiReadSession(null);
        if (change === 'switch-and-return') {
          setApiReadSession('another');
          setApiReadSession('athlete');
        }
        return change === 'denied'
          ? new Response('{"error":"Denied"}', { status: 401 })
          : new Response('{"analysis":{}}');
      });
      if (change === 'denied') await expect(api.analyzeWod('wod')).rejects.toThrow('Denied');
      else await api.analyzeWod('wod');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('does not instrument HYROX and still works without crypto.randomUUID', async () => {
    vi.stubGlobal('crypto', {});
    await api.analyzeWod('wod');
    expect(fetchMock.mock.calls[0]![1].headers['X-Wod-Measurement-Id']).toBeUndefined();
    await api.generateHyroxWorkoutStrategy('wod');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('still generates when creating a telemetry identifier fails', async () => {
    vi.stubGlobal('crypto', {
      randomUUID: () => {
        throw new Error('unavailable');
      },
    });
    expect(await api.analyzeWod('wod')).toMatchObject({ analysis: {} });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
