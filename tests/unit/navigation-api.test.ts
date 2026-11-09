import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, setApiReadSession } from '../../apps/web/src/lib/api.js';

const fetchMock = vi.fn();
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => {
  setApiReadSession(null);
  setApiReadSession('a');
  fetchMock.mockReset().mockImplementation(async () => reply({ wods: [], profile: {} }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  setApiReadSession(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('navigation read freshness', () => {
  it.each(['hyrox', 'records'] as const)(
    'cancels a departing %s screen without cancelling a shared destination read',
    async (kind) => {
      let finish!: () => void;
      const pending = new Promise<void>((resolve) => {
        finish = resolve;
      });
      fetchMock.mockImplementation(async () => {
        await pending;
        return reply({ workouts: [{ id: 'hyrox' }], records: [{ id: 'record' }] });
      });
      const read = (signal?: AbortSignal) =>
        kind === 'hyrox' ? api.listHyroxWorkouts(100, signal) : api.listPersonalRecords(signal);
      const controller = new AbortController();
      const departing = read(controller.signal);
      const rejected = expect(departing).rejects.toMatchObject({ name: 'AbortError' });
      const destination = read();
      controller.abort();
      finish();
      await rejected;
      await expect(destination).resolves.toHaveProperty(kind === 'hyrox' ? 'workouts' : 'records');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('reuses recent list reads but keeps distinct query limits', async () => {
    await api.listWods(100);
    await api.listWods(100);
    await api.listWods(20);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('always rechecks ranking, administration and authentication', async () => {
    for (let i = 0; i < 2; i++) {
      await api.getMonthlyRanking('2026-11');
      await api.getAdminUsers();
      await api.me();
    }
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it.each([true, false])(
    'invalidates cached and mid-save reads when a save succeeds=%s',
    async (success) => {
      await api.listWods(100);
      let finish!: () => void;
      const hold = new Promise<void>((resolve) => {
        finish = resolve;
      });
      fetchMock.mockImplementation(async (_url: string, options: RequestInit) => {
        if (options.method === 'POST') {
          await hold;
          return reply(success ? { result: {} } : { error: 'Failed' }, success ? 200 : 500);
        }
        return reply({ wods: [] });
      });
      const saving = api.saveWodResult('wod', { score: 'Cap +1' });
      const saved = success ? saving : expect(saving).rejects.toThrow('Failed');
      await api.listWods(100);
      finish();
      await saved;
      await api.listWods(100);
      expect(fetchMock).toHaveBeenCalledTimes(4);
    },
  );

  it('invalidates list reads after submitting a workout form', async () => {
    await api.listWods(100);
    await api.submitWod({ rawText: '10 burpees' });
    await api.listWods(100);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not invalidate tab data for the read-only push status POST', async () => {
    await api.listWods(100);
    await api.getPushSubscriptionStatus('https://push.example/device');
    await api.getPushSubscriptionStatus('https://push.example/device');
    await api.listWods(100);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('discards all responses after access expires, even within the freshness window', async () => {
    await api.listWods(100);
    fetchMock.mockResolvedValueOnce(reply({ error: 'Expired' }, 401));
    await expect(api.me()).rejects.toThrow('Expired');
    await api.listWods(100);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not let a late access denial from the previous account clear the current session', async () => {
    const events = new EventTarget();
    const denied = vi.fn();
    events.addEventListener('access-denied', denied);
    vi.stubGlobal('window', events);
    let finish!: () => void;
    const hold = new Promise<void>((resolve) => {
      finish = resolve;
    });
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/auth/me')) {
        await hold;
        return reply({ code: 'ACCESS_DENIED', error: 'Previous account blocked' }, 403);
      }
      return reply({ wods: [{ id: 'current-user-workout' }] });
    });
    const old = api.me();
    const rejected = expect(old).rejects.toThrow('Previous account blocked');
    setApiReadSession('b');
    await api.listWods(100);
    finish();
    await rejected;
    expect((await api.listWods(100)).wods[0]!.id).toBe('current-user-workout');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(denied).not.toHaveBeenCalled();
  });

  it('does not reuse yesterday check-in after Sao Paulo midnight', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-04T02:59:59Z'));
    await api.getTodayCheckin();
    vi.setSystemTime(new Date('2026-11-04T03:00:00Z'));
    await api.getTodayCheckin();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
