import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type Wod } from '../../apps/web/src/lib/api.js';

const fetchMock = vi.fn();
const wod = { id: 'wod', rawText: '21-15-9', imageMimeType: 'image/png' } as Wod;
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('workout detail loading', () => {
  it('uses one request for all active data and does not fetch the photo during initial display', async () => {
    fetchMock.mockResolvedValue(
      reply({ detailVersion: 1, wod, analysis: { id: 'a' }, strategy: { id: 's' } }),
    );
    const source = vi.fn();
    const result = await api.getWodDetail('wod', undefined, source);
    expect(result).toEqual({ wod, analysis: { id: 'a' }, strategy: { id: 's' }, readErrors: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/wods\/wod\?view=detail$/);
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include');
    expect(source).toHaveBeenCalledWith(wod);
  });

  it('accepts explicit null projections as not yet generated', async () => {
    fetchMock.mockResolvedValue(reply({ detailVersion: 1, wod, analysis: null, strategy: null }));
    expect(await api.getWodDetail('wod')).toMatchObject({
      analysis: null,
      strategy: null,
      readErrors: [],
    });
  });

  it.each([
    { detailVersion: 1, wod, analysis: null },
    { detailVersion: 2, wod, analysis: null, strategy: null },
  ])(
    'rejects incomplete/unsupported modern reads without falling back to absence',
    async (payload) => {
      fetchMock.mockResolvedValue(reply(payload));
      await expect(api.getWodDetail('wod')).rejects.toThrow('Dados do treino incompletos');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('does not retry a failed modern request as a legacy read', async () => {
    fetchMock.mockResolvedValue(reply({ error: 'Falha de leitura' }, 500));
    await expect(api.getWodDetail('wod')).rejects.toThrow('Falha de leitura');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reveals the source early with legacy servers, preserving failed projections as errors', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    fetchMock.mockImplementation(async (path: string) => {
      if (path.endsWith('?view=detail')) return reply({ wod });
      await held;
      return path.endsWith('/analysis')
        ? reply({ error: 'Sem analise' }, 404)
        : reply({ error: 'Indisponivel' }, 500);
    });
    const source = vi.fn();
    const pending = api.getWodDetail('wod', undefined, source);
    await vi.waitFor(() => expect(source).toHaveBeenCalledWith(wod));
    release();
    expect(await pending).toEqual({
      wod,
      analysis: null,
      strategy: null,
      readErrors: ['Erro ao carregar estrategia: Indisponivel'],
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('ignores a response aborted while changing workouts', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(async () => {
      controller.abort();
      return reply({ detailVersion: 1, wod, analysis: null, strategy: null });
    });
    const source = vi.fn();
    await expect(api.getWodDetail('wod', controller.signal, source)).rejects.toThrow('Aborted');
    expect(source).not.toHaveBeenCalled();
  });
});
