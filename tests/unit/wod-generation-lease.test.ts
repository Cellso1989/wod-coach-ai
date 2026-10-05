import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  runWodGeneration,
  WodGenerationConflictError,
} from '../../apps/api/src/services/wod-generation-lease.js';

const query = vi.hoisted(() => vi.fn());
vi.mock('../../packages/database/dist/index.js', () => ({ prisma: { $queryRaw: query } }));

beforeEach(() => {
  query.mockReset();
});
const options = () => ({
  wodId: 'wod',
  userId: 'user',
  operation: 'ANALYSIS' as const,
  onCleanupError: vi.fn(),
});

describe('WOD generation reservation', () => {
  it('does not enter the work or release someone else reservation when admission is denied', async () => {
    query.mockResolvedValue([]);
    const work = vi.fn();
    await expect(runWodGeneration(options(), work)).rejects.toBeInstanceOf(
      WodGenerationConflictError,
    );
    expect(work).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('fails closed if the database is unavailable', async () => {
    query.mockRejectedValue(new Error('DB down'));
    const work = vi.fn();
    await expect(runWodGeneration(options(), work)).rejects.toThrow('DB down');
    expect(work).not.toHaveBeenCalled();
  });
  it('uses the same token in the ownership check and cleanup', async () => {
    query.mockResolvedValue([{ token: 'owned' }]);
    await expect(
      runWodGeneration(options(), async (lease) => {
        await lease.assertOwned();
        return 'saved';
      }),
    ).resolves.toBe('saved');
    const token = query.mock.calls[0]![1];
    expect(query.mock.calls[1]!.slice(1)).toEqual(['wod', token]);
    expect(query.mock.calls[2]!.slice(1)).toEqual(['wod', token]);
  });
  it('rejects an expired owner and still attempts token-scoped cleanup', async () => {
    query.mockResolvedValueOnce([{ token: 'owned' }]).mockResolvedValue([]);
    await expect(
      runWodGeneration(options(), async (lease) => {
        await lease.assertOwned();
      }),
    ).rejects.toBeInstanceOf(WodGenerationConflictError);
    expect(query).toHaveBeenCalledTimes(3);
  });
  it.each([true, false])(
    'cleanup failure does not mask a committed result or the original failure (success: %s)',
    async (success) => {
      query
        .mockResolvedValueOnce([{ token: 'owned' }])
        .mockRejectedValueOnce(new Error('Cleanup failed'));
      const config = options();
      const result = runWodGeneration(config, async () => {
        if (!success) throw new Error('Original error');
        return 'saved';
      });
      if (success) await expect(result).resolves.toBe('saved');
      else await expect(result).rejects.toThrow('Original error');
      expect(config.onCleanupError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Cleanup failed' }),
      );
    },
  );
});
