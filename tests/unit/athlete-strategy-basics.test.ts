import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readAthleteStrategyBasics } from '../../apps/api/src/services/athlete-strategy-basics.js';
const query = vi.hoisted(() => vi.fn());
vi.mock('../../packages/database/dist/index.js', () => ({ prisma: { $queryRaw: query } }));
beforeEach(() => query.mockReset());
describe('account-scoped strategy basics', () => {
  it('loads only the consumed fields in one parameterized call and restores UTC dates', async () => {
    const date = '2026-11-08T08:30:00+00:00';
    query.mockResolvedValue([
      {
        profile: null,
        checkins: [{ date }],
        personalRecords: [
          {
            movementName: 'Pull-up',
            value: 22,
            unit: 'reps',
            recordType: 'UNBROKEN_REPS',
            repetitions: 22,
            achievedAt: date,
          },
        ],
      },
    ]);
    const result = await readAthleteStrategyBasics('account-private');
    expect(query).toHaveBeenCalledTimes(1);
    expect(result.checkins[0]!.date.toISOString()).toBe('2026-11-08T08:30:00.000Z');
    expect(result.personalRecords[0]!.achievedAt).toEqual(result.checkins[0]!.date);
    const [strings, ...values] = query.mock.calls[0];
    expect(values.filter((value) => value === 'account-private')).toHaveLength(3);
    const sql = strings.join('?');
    expect(sql).not.toContain('account-private');
    expect(sql).not.toMatch(/imageData|rawText|passwordHash|notes/);
    expect(sql.match(/AT TIME ZONE 'UTC'/g)).toHaveLength(2);
    expect(values.find((value) => value instanceof Date)).toBeInstanceOf(Date);
  });
  it('fails closed on an invalid database result instead of fabricating a profile or PR', async () => {
    query.mockResolvedValue([
      { profile: { level: 'invented' }, checkins: [], personalRecords: [] },
    ]);
    await expect(readAthleteStrategyBasics('athlete')).rejects.toThrow();
  });
});
