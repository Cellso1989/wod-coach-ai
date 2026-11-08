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
  function emptyHistory() {
    prisma.wod.findMany.mockResolvedValue([]);
    prisma.dailyCheckin.findMany.mockResolvedValue([]);
    prisma.personalRecord.findMany.mockResolvedValue([]);
  }

  const targetFixture = () => ({
    id: 'target',
    userId: 'athlete',
    rawText: 'AMRAP 12: Pull-ups',
    imageData: 'source image retained for the version',
    analysis: {
      versionId: 'captured-analysis',
      format: 'AMRAP',
      durationMinutes: 12,
      stimulus: 'mixed_modal',
      movements: [{ name: 'Pull-up', category: 'gymnastics' }],
    },
  });

  it('starts scoped history before the reserved target read completes, preserving one target snapshot', async () => {
    emptyHistory();
    const target = targetFixture();
    let finish!: () => void;
    prisma.wod.findFirst.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(target);
        }),
    );
    const result = getAthleteContextForWod('athlete', 'target', undefined, {
      parallelHistory: true,
    });
    try {
      expect(prisma.wod.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.dailyCheckin.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.personalRecord.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.wod.findMany.mock.calls[0][0].where).toMatchObject({
        userId: 'athlete',
        id: { not: 'target' },
      });
    } finally {
      finish();
      await result;
    }
    const loaded = await result;
    expect(loaded.targetWod).toEqual(target);
    expect(loaded.targetAnalysis.durationMinutes).toBe(target.analysis.durationMinutes);
    expect(prisma.wod.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.wod.findFirst).toHaveBeenCalledWith({
      where: { id: 'target', userId: 'athlete' },
      include: { analysis: { include: { movements: true } } },
    });
  });

  it.each([null, { id: 'target', analysis: null }])(
    'settles speculative history before a target error and prioritizes that error (%j)',
    async (target) => {
      emptyHistory();
      const historyFailure = new Error('private history error');
      prisma.wod.findFirst.mockResolvedValueOnce(target);
      prisma.wod.findMany.mockRejectedValueOnce(historyFailure);
      let finish!: () => void;
      prisma.personalRecord.findMany.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = () => resolve([]);
          }),
      );
      let done = false;
      const result = getAthleteContextForWod('athlete', 'target', undefined, {
        parallelHistory: true,
      });
      const assertion = expect(result).rejects.toBeInstanceOf(
        target ? WodNotAnalyzedError : WodNotFoundError,
      );
      void result.then(
        () => {
          done = true;
        },
        () => {
          done = true;
        },
      );
      await vi.waitFor(() => expect(finish).toBeDefined());
      expect(done).toBe(false);
      finish();
      await assertion;
      expect(done).toBe(true);
    },
  );

  it('settles the target read before rejecting failed parallel history', async () => {
    emptyHistory();
    const failure = new Error('history unavailable');
    prisma.wod.findMany.mockRejectedValueOnce(failure);
    let finish!: () => void;
    prisma.wod.findFirst.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(targetFixture());
        }),
    );
    let done = false;
    const result = getAthleteContextForWod('athlete', 'target', undefined, {
      parallelHistory: true,
    });
    const assertion = expect(result).rejects.toBe(failure);
    void result.then(
      () => {
        done = true;
      },
      () => {
        done = true;
      },
    );
    await Promise.resolve();
    expect(done).toBe(false);
    finish();
    await assertion;
    expect(done).toBe(true);
  });

  it('returns the same context and source data with sequential and parallel history', async () => {
    const now = new Date();
    prisma.wod.findFirst.mockImplementation(async () => structuredClone(targetFixture()));
    prisma.wod.findMany.mockResolvedValue([
      {
        id: 'prior',
        date: now,
        analysis: targetFixture().analysis,
        result: { score: '5 rounds' },
        strategy: {
          recommendedIntensity: 9,
          targetRpe: 10,
          criticalPoint: 'Grip',
          breakStrategy: [{ movement: 'Pull-up', strategy: '6/4' }],
        },
      },
    ]);
    prisma.dailyCheckin.findMany.mockResolvedValue([{ date: now }]);
    prisma.personalRecord.findMany.mockResolvedValue([
      {
        movementName: 'Pull-up',
        value: 20,
        unit: 'reps',
        recordType: 'UNBROKEN_REPS',
        repetitions: 20,
        achievedAt: now,
      },
    ]);
    const sequential = await getAthleteContextForWod('athlete', 'target');
    const parallel = await getAthleteContextForWod('athlete', 'target', undefined, {
      parallelHistory: true,
    });
    expect(parallel).toEqual(sequential);
    expect(parallel.context.similarWods).toHaveLength(1);
    expect(parallel.context.relevantPersonalRecords).toHaveLength(1);
  });
  it('settles all account-scoped history reads before reporting a failure', async () => {
    prisma.wod.findFirst.mockResolvedValue({ id: 'target', analysis: {} });
    const failure = new Error('history unavailable');
    prisma.wod.findMany.mockRejectedValue(failure);
    let finish!: () => void;
    prisma.dailyCheckin.findMany.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve([]);
        }),
    );
    prisma.personalRecord.findMany.mockResolvedValue([]);
    const completed: string[] = [];
    const result = getAthleteContextForWod('athlete', 'target', async (name, work) => {
      try {
        return await work();
      } finally {
        completed.push(name);
      }
    });
    const assertion = expect(result).rejects.toBe(failure);
    await vi.waitFor(() => expect(finish).toBeDefined());
    expect(completed).toContain('context.history');
    expect(completed).not.toContain('context.checkins');
    finish();
    await assertion;
    expect(completed.sort()).toEqual([
      'context.checkins',
      'context.history',
      'context.personalRecords',
      'context.target',
    ]);
    expect(prisma.dailyCheckin.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'athlete' }),
      }),
    );
    expect(prisma.personalRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'athlete' },
      }),
    );
  });
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
