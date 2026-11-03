import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAthleteContextForWod,
  WodNotFoundError,
  WodNotAnalyzedError,
} from '../../apps/api/src/services/athlete-context-service.js';

const prisma = vi.hoisted(() => ({
  wod: { findFirst: vi.fn(), findMany: vi.fn() },
  dailyCheckin: { findMany: vi.fn() },
  personalRecord: { findMany: vi.fn() },
}));
vi.mock('../../packages/database/dist/index.js', () => ({ prisma }));

beforeEach(() => vi.resetAllMocks());

describe('athlete history projection', () => {
  it('keeps score, prior advice, PRs and training counts while excluding photos and full AI payloads', async () => {
    const now = new Date();
    const analysis = {
      format: 'AMRAP',
      durationMinutes: 12,
      stimulus: 'mixed_modal',
      movements: [{ name: 'Pull-up', category: 'gymnastics' }],
    };
    const target = { id: 'target', analysis, imageData: 'current source retained for versioning' };
    const prior = {
      recommendedIntensity: 9,
      targetRpe: 10,
      criticalPoint: 'Grip',
      breakStrategy: [{ movement: 'Pull-up', strategy: '6/4' }],
    };
    const pr = {
      movementName: 'Pull-up',
      value: 20,
      unit: 'reps',
      recordType: 'UNBROKEN_REPS',
      repetitions: 20,
      achievedAt: now,
    };
    prisma.wod.findFirst.mockResolvedValue(target);
    prisma.wod.findMany.mockResolvedValue([
      { id: 'prior', date: now, analysis, result: { score: '8 rounds' }, strategy: prior },
      { id: 'unanalyzed', date: now, analysis: null, result: null, strategy: null },
    ]);
    prisma.dailyCheckin.findMany.mockResolvedValue([{ date: now }]);
    prisma.personalRecord.findMany.mockResolvedValue([pr]);

    const result = await getAthleteContextForWod('athlete', 'target');
    expect(result.targetWod).toEqual(target);
    expect(result.context.trainingLoad.last7Days.sessionCount).toBe(2);
    expect(result.context.similarWods).toHaveLength(1);
    expect(result.context.similarWods[0]).toMatchObject({
      wodId: 'prior',
      result: { score: '8 rounds' },
      previousStrategy: prior,
    });
    expect(result.context.relevantPersonalRecords).toEqual([pr]);
    const query = prisma.wod.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({ userId: 'athlete', id: { not: 'target' } });
    expect(query.take).toBe(100);
    expect(query.select).toBeDefined();
    expect(query.include).toBeUndefined();
    for (const field of ['imageData', 'rawText', 'notes'])
      expect(query.select[field]).toBeUndefined();
    expect(query.select.analysis.select.rawResponse).toBeUndefined();
    expect(query.select.strategy.select.rawResponse).toBeUndefined();
    expect(query.select.result.select).toEqual({ score: true });
  });

  it.each([null, { id: 'target', analysis: null }])(
    'does not fetch history for missing target/analysis: %j',
    async (target) => {
      prisma.wod.findFirst.mockResolvedValue(target);
      await expect(getAthleteContextForWod('athlete', 'target')).rejects.toBeInstanceOf(
        target ? WodNotAnalyzedError : WodNotFoundError,
      );
      expect(prisma.wod.findMany).not.toHaveBeenCalled();
    },
  );
});
