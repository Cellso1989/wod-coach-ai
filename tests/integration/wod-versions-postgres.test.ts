import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../packages/database/dist/index.js';
import { buildApp } from '../../apps/api/src/app.js';
import { simpleSourceCase, wodFormatCases } from '../fixtures/wod-format-cases.js';

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  pauseRead: null as (() => Promise<void>) | null,
  pauseTarget: null as (() => Promise<void>) | null,
}));
vi.mock('../../packages/database/dist/index.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('@wod-coach-ai/database')>();
  return {
    ...original,
    // Pause a real query result to reproduce the read-before-lock race deterministically.
    prisma: original.prisma.$extends({
      query: {
        wod: {
          async findFirst({ args, query }) {
            const row = await query(args);
            if (args.include?.analysis && mocks.pauseTarget) {
              const pause = mocks.pauseTarget;
              mocks.pauseTarget = null;
              await pause();
            }
            const pause = mocks.pauseRead;
            if (pause) {
              mocks.pauseRead = null;
              await pause();
            }
            return row;
          },
        },
      },
    }),
  };
});
vi.mock('../../packages/ai/dist/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@wod-coach-ai/ai')>()),
  createOpenAiMessageSender: () => mocks.sendMessage,
}));

const ANALYSIS = {
  format: 'AMRAP',
  durationMinutes: 15,
  stimulus: 'grip',
  estimatedIntensity: 8,
  movements: [{ name: 'Toes to Bar', category: 'gymnastics', reps: 10 }],
  rounds: [
    {
      roundNumber: 1,
      label: 'Round',
      movements: [{ name: 'Toes to Bar', category: 'gymnastics', reps: 10 }],
    },
  ],
  estimatedDemand: { engine: 6, grip: 8, legs: 3, gymnastics: 8, technical: 5 },
  confidence: 0.8,
  warnings: [],
};
const STRATEGY = {
  recommendedIntensity: 9,
  targetRpe: 10,
  loadRecommendation: null,
  pacing: 'Steady',
  breakStrategy: [{ movement: 'Toes to Bar', strategy: '6/4' }],
  movementStrategy: [{ movement: 'Toes to Bar', strategy: 'Steady kip' }],
  restStrategy: '5 seconds',
  transitionStrategy: 'Quick',
  energyManagement: 'Save grip',
  goal: '8 rounds',
  target: '8-9 rounds',
  criticalPoint: 'Grip',
  confidence: 0.8,
  warnings: [],
};

// Opt-in suite for the disposable database seeded with the legacy fixture.
describe.skipIf(!process.env.WOD_VERSION_TEST_DATABASE_URL)('WOD versions on PostgreSQL', () => {
  let app: ReturnType<typeof buildApp>;
  let headers: { authorization: string };
  const wodId = 'version-legacy-wod';

  beforeAll(async () => {
    const database = new URL(process.env.WOD_VERSION_TEST_DATABASE_URL!);
    if (
      database.hostname !== '127.0.0.1' ||
      database.pathname !== '/wod_versions' ||
      process.env.DATABASE_URL !== database.href
    )
      throw new Error('Use the disposable version test database');
    app = buildApp();
    await app.ready();
    const encoded = [{ alg: 'HS256', typ: 'JWT' }, { sub: 'version-legacy-user' }]
      .map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'))
      .join('.');
    headers = {
      authorization: `Bearer ${encoded}.${createHmac('sha256', process.env.JWT_SECRET!).update(encoded).digest('base64url')}`,
    };
  });
  afterAll(async () => {
    if (app) await app.close();
  });

  async function request(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    suffix: string,
    payload?: object,
  ) {
    return app.inject({ method, url: `/api/wods/${wodId}${suffix}`, headers, payload });
  }

  it('backfills legacy snapshots without guessing AI input or analysis linkage, and leaves HYROX intact', async () => {
    expect(
      await prisma.personalRecord.findUniqueOrThrow({ where: { id: 'version-legacy-pr' } }),
    ).toMatchObject({
      value: 100,
      unit: 'kg',
      recordType: 'UNKNOWN',
      repetitions: null,
    });
    const versions = (await request('GET', '/versions')).json();
    expect(versions.analysisVersions[0]).toMatchObject({
      version: 1,
      reason: 'LEGACY',
      sourceSnapshot: { rawText: 'AMRAP 15: 10 T2B' },
      snapshot: { movements: [{ name: 'Toes to Bar', reps: 10 }] },
    });
    expect(versions.strategyVersions[0]).toMatchObject({
      version: 1,
      inputSnapshot: null,
      analysisVersionId: null,
    });
    expect(versions.analysisVersions[0].snapshot.generationMetadata).toBeUndefined();
    expect(versions.strategyVersions[0].snapshot.generationMetadata).toBeUndefined();
    expect(
      (await prisma.wodAnalysis.findUniqueOrThrow({ where: { wodId: 'version-legacy-hyrox' } }))
        .versionId,
    ).toBeNull();
  });

  it('retains versions across real analysis, strategy, duration and text edits', async () => {
    mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(ANALYSIS) });
    expect((await request('POST', '/analyze')).statusCode).toBe(200);
    mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(STRATEGY) });
    expect((await request('POST', '/strategy')).statusCode).toBe(200);
    const input = mocks.sendMessage.mock.calls.at(-1)![0].messages[0].content[0].text;
    const strategyVersion = await prisma.wodStrategyVersion.findFirstOrThrow({
      where: { wodId },
      orderBy: { version: 'desc' },
    });
    expect(strategyVersion.inputSnapshot).toEqual(JSON.parse(input.slice(input.indexOf('{'))));
    expect(strategyVersion.analysisVersionId).toBe(
      (await prisma.wodAnalysis.findUniqueOrThrow({ where: { wodId } })).versionId,
    );
    expect((await request('PATCH', '/analysis', { durationMinutes: 18 })).statusCode).toBe(200);
    expect((await request('GET', '/strategy')).statusCode).toBe(404);
    expect((await request('PUT', '', { rawText: 'AMRAP 10: 5 Burpees' })).statusCode).toBe(200);
    expect((await request('GET', '/analysis')).statusCode).toBe(404);
    const versions = (await request('GET', '/versions')).json();
    expect(
      versions.analysisVersions.map((version: { version: number }) => version.version),
    ).toEqual([3, 2, 1]);
    expect(versions.strategyVersions).toHaveLength(2);
    expect(
      (await request('GET', '/versions?analysisBefore=3&strategyBefore=2')).json().analysisVersions,
    ).toHaveLength(2);
  });

  it('rolls back an active analysis if the archive insert fails in PostgreSQL', async () => {
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION fail_version_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'version insert failed'; END; $$`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER fail_version BEFORE INSERT ON wod_analysis_versions FOR EACH ROW EXECUTE FUNCTION fail_version_insert()`,
    );
    mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(ANALYSIS) });
    try {
      expect((await request('POST', '/analyze')).statusCode).toBe(500);
      expect(await prisma.wodAnalysis.findUnique({ where: { wodId } })).toBeNull();
      expect(await prisma.wodAnalysisVersion.count({ where: { wodId } })).toBe(3);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER fail_version ON wod_analysis_versions');
      await prisma.$executeRawUnsafe('DROP FUNCTION fail_version_insert()');
    }
  });

  it('deletes the entire WOD and its history only on explicit WOD deletion', async () => {
    expect((await request('DELETE', '')).statusCode).toBe(204);
    expect(await prisma.wodAnalysisVersion.count({ where: { wodId } })).toBe(0);
    expect(await prisma.wodStrategyVersion.count({ where: { wodId } })).toBe(0);
  });

  it('rejects overlapping analyses and allocates distinct versions for intentional sequential reanalysis', async () => {
    const fresh = await prisma.wod.create({
      data: {
        userId: 'version-legacy-user',
        date: new Date(),
        sourceType: 'TEXT',
        rawText: 'AMRAP 15: 10 T2B',
      },
    });
    mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(ANALYSIS) });
    let started = () => {};
    let release = () => {};
    const observed = new Promise<void>((resolve) => {
      started = resolve;
    });
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.sendMessage.mockImplementationOnce(async () => {
      started();
      await paused;
      return { text: JSON.stringify(ANALYSIS) };
    });
    const first = app.inject({ method: 'POST', url: `/api/wods/${fresh.id}/analyze`, headers });
    try {
      await observed;
      expect(
        (await app.inject({ method: 'POST', url: `/api/wods/${fresh.id}/analyze`, headers }))
          .statusCode,
      ).toBe(409);
      release();
      expect((await first).statusCode).toBe(200);
      expect(
        (await app.inject({ method: 'POST', url: `/api/wods/${fresh.id}/analyze`, headers }))
          .statusCode,
      ).toBe(200);
      const versions = await prisma.wodAnalysisVersion.findMany({
        where: { wodId: fresh.id },
        orderBy: { version: 'asc' },
      });
      expect(versions.map((version) => version.version)).toEqual([1, 2]);
      expect(
        (await prisma.wodAnalysis.findUniqueOrThrow({ where: { wodId: fresh.id } })).versionId,
      ).toBe(versions[1].id);
    } finally {
      release();
      await first;
      await prisma.wod.delete({ where: { id: fresh.id } });
    }
  });

  it.each(['analyze', 'strategy'] as const)(
    'shares the %s reservation across independent API instances',
    async (operation) => {
      const fresh = await prisma.wod.create({
        data: {
          userId: 'version-legacy-user',
          date: new Date(),
          sourceType: 'TEXT',
          rawText: 'AMRAP 15: 10 T2B',
        },
      });
      const otherApp = buildApp();
      await otherApp.ready();
      const url = `/api/wods/${fresh.id}`;
      let release = () => {};
      let pending: ReturnType<typeof app.inject> | undefined;
      try {
        mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(ANALYSIS) });
        if (operation === 'strategy')
          expect(
            (await app.inject({ method: 'POST', url: `${url}/analyze`, headers })).statusCode,
          ).toBe(200);
        const output = operation === 'analyze' ? ANALYSIS : STRATEGY;
        mocks.sendMessage.mockClear();
        let started = () => {};
        const observed = new Promise<void>((resolve) => {
          started = resolve;
        });
        const paused = new Promise<void>((resolve) => {
          release = resolve;
        });
        mocks.sendMessage.mockImplementationOnce(async () => {
          started();
          await paused;
          return { text: JSON.stringify(output) };
        });
        mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(output) });
        pending = app.inject({ method: 'POST', url: `${url}/${operation}`, headers });
        await observed;
        expect(await prisma.wodGenerationLease.count({ where: { wodId: fresh.id } })).toBe(1);
        expect(
          (await otherApp.inject({ method: 'POST', url: `${url}/${operation}`, headers }))
            .statusCode,
        ).toBe(409);
        expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
        release();
        expect((await pending).statusCode).toBe(200);
        expect(await prisma.wodGenerationLease.count({ where: { wodId: fresh.id } })).toBe(0);
      } finally {
        release();
        if (pending) await pending;
        await prisma.wod.delete({ where: { id: fresh.id } });
        await otherApp.close();
      }
    },
  );

  it('recovers an expired reservation without letting its old owner publish or delete the successor', async () => {
    const fresh = await prisma.wod.create({
      data: {
        userId: 'version-legacy-user',
        date: new Date(),
        sourceType: 'TEXT',
        rawText: 'AMRAP 15: 10 T2B',
      },
    });
    const url = `/api/wods/${fresh.id}/analyze`;
    let releaseOld = () => {};
    let releaseNew = () => {};
    let startOld = () => {};
    let startNew = () => {};
    const oldStarted = new Promise<void>((resolve) => {
      startOld = resolve;
    });
    const newStarted = new Promise<void>((resolve) => {
      startNew = resolve;
    });
    const oldPaused = new Promise<void>((resolve) => {
      releaseOld = resolve;
    });
    const newPaused = new Promise<void>((resolve) => {
      releaseNew = resolve;
    });
    mocks.sendMessage.mockImplementationOnce(async () => {
      startOld();
      await oldPaused;
      return { text: JSON.stringify(ANALYSIS) };
    });
    mocks.sendMessage.mockImplementationOnce(async () => {
      startNew();
      await newPaused;
      return { text: JSON.stringify(ANALYSIS) };
    });
    const old = app.inject({ method: 'POST', url, headers });
    let successor: ReturnType<typeof app.inject> | undefined;
    try {
      await oldStarted;
      await prisma.wodGenerationLease.update({
        where: { wodId: fresh.id },
        data: { expiresAt: new Date(0) },
      });
      successor = app.inject({ method: 'POST', url, headers });
      await newStarted;
      const owner = await prisma.wodGenerationLease.findUniqueOrThrow({
        where: { wodId: fresh.id },
      });
      releaseOld();
      expect((await old).statusCode).toBe(409);
      expect(
        (await prisma.wodGenerationLease.findUniqueOrThrow({ where: { wodId: fresh.id } })).token,
      ).toBe(owner.token);
      expect(await prisma.wodAnalysisVersion.count({ where: { wodId: fresh.id } })).toBe(0);
      releaseNew();
      expect((await successor).statusCode).toBe(200);
      expect(await prisma.wodAnalysisVersion.count({ where: { wodId: fresh.id } })).toBe(1);
      expect(await prisma.wodGenerationLease.count({ where: { wodId: fresh.id } })).toBe(0);
    } finally {
      releaseOld();
      releaseNew();
      await old;
      if (successor) await successor;
      await prisma.wod.delete({ where: { id: fresh.id } });
    }
  });

  it('allows independent WODs while another generation is in progress', async () => {
    const data = {
      userId: 'version-legacy-user',
      date: new Date(),
      sourceType: 'TEXT' as const,
      rawText: 'AMRAP 15: 10 T2B',
    };
    const firstWod = await prisma.wod.create({ data });
    const secondWod = await prisma.wod.create({ data });
    let release = () => {};
    let started = () => {};
    const observed = new Promise<void>((resolve) => {
      started = resolve;
    });
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.sendMessage.mockImplementationOnce(async () => {
      started();
      await paused;
      return { text: JSON.stringify(ANALYSIS) };
    });
    mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(ANALYSIS) });
    const first = app.inject({ method: 'POST', url: `/api/wods/${firstWod.id}/analyze`, headers });
    try {
      await observed;
      expect(
        (await app.inject({ method: 'POST', url: `/api/wods/${secondWod.id}/analyze`, headers }))
          .statusCode,
      ).toBe(200);
      release();
      expect((await first).statusCode).toBe(200);
    } finally {
      release();
      await first;
      await prisma.wod.deleteMany({ where: { id: { in: [firstWod.id, secondWod.id] } } });
    }
  });

  it.each([true, false])(
    'compares the locked text during concurrent edits (changes current text: %s)',
    async (changesCurrentText) => {
      const oldText = 'AMRAP 15: 10 T2B';
      const newText = 'AMRAP 18: 10 T2B';
      const fresh = await prisma.wod.create({
        data: {
          userId: 'version-legacy-user',
          date: new Date(),
          sourceType: 'TEXT',
          rawText: oldText,
        },
      });
      const url = `/api/wods/${fresh.id}`;
      let release: () => void = () => {};
      let started: () => void = () => {};
      const observed = new Promise<void>((resolve) => {
        started = resolve;
      });
      const paused = new Promise<void>((resolve) => {
        release = resolve;
      });
      mocks.pauseRead = async () => {
        started();
        await paused;
      };
      const pending = app.inject({
        method: 'PUT',
        url,
        headers,
        payload: { rawText: changesCurrentText ? oldText : newText },
      });
      try {
        await observed;
        expect(
          (await app.inject({ method: 'PUT', url, headers, payload: { rawText: newText } }))
            .statusCode,
        ).toBe(200);
        mocks.sendMessage.mockResolvedValue({
          text: JSON.stringify({ ...ANALYSIS, durationMinutes: 18 }),
        });
        expect(
          (await app.inject({ method: 'POST', url: `${url}/analyze`, headers })).statusCode,
        ).toBe(200);
        mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(STRATEGY) });
        expect(
          (await app.inject({ method: 'POST', url: `${url}/strategy`, headers })).statusCode,
        ).toBe(200);
        const analysis = await prisma.wodAnalysis.findUniqueOrThrow({ where: { wodId: fresh.id } });
        const strategy = await prisma.wodStrategy.findUniqueOrThrow({ where: { wodId: fresh.id } });
        const history = await prisma.wodAnalysisVersion.findMany({ where: { wodId: fresh.id } });
        const strategies = await prisma.wodStrategyVersion.findMany({ where: { wodId: fresh.id } });
        release();
        expect((await pending).statusCode).toBe(200);
        expect((await prisma.wod.findUniqueOrThrow({ where: { id: fresh.id } })).rawText).toBe(
          changesCurrentText ? oldText : newText,
        );
        expect(await prisma.wodAnalysis.findUnique({ where: { wodId: fresh.id } })).toEqual(
          changesCurrentText ? null : analysis,
        );
        expect(await prisma.wodStrategy.findUnique({ where: { wodId: fresh.id } })).toEqual(
          changesCurrentText ? null : strategy,
        );
        expect(await prisma.wodAnalysisVersion.findMany({ where: { wodId: fresh.id } })).toEqual(
          history,
        );
        expect(await prisma.wodStrategyVersion.findMany({ where: { wodId: fresh.id } })).toEqual(
          strategies,
        );
      } finally {
        release();
        await pending;
        mocks.pauseRead = null;
        await prisma.wod.delete({ where: { id: fresh.id } });
      }
    },
  );

  for (const reanalysis of [false, true]) {
    it(`preserves PostgreSQL state after unsupported load guidance (reanalysis: ${reanalysis})`, async () => {
      const fresh = await prisma.wod.create({
        data: {
          userId: 'version-legacy-user',
          date: new Date(),
          sourceType: 'TEXT',
          rawText: 'AMRAP 15: 10 T2B',
        },
      });
      const url = `/api/wods/${fresh.id}`;
      const include = {
        analysis: { include: { movements: true } },
        strategy: true,
        analysisVersions: true,
        strategyVersions: true,
        result: true,
      } as const;
      try {
        mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(ANALYSIS) });
        expect(
          (await app.inject({ method: 'POST', url: `${url}/analyze`, headers })).statusCode,
        ).toBe(200);
        if (reanalysis) {
          mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(STRATEGY) });
          expect(
            (await app.inject({ method: 'POST', url: `${url}/strategy`, headers })).statusCode,
          ).toBe(200);
          mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(ANALYSIS) });
          expect(
            (await app.inject({ method: 'POST', url: `${url}/analyze`, headers })).statusCode,
          ).toBe(200);
        }
        mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(STRATEGY) });
        expect(
          (await app.inject({ method: 'POST', url: `${url}/strategy`, headers })).statusCode,
        ).toBe(200);
        const before = await prisma.wod.findUniqueOrThrow({ where: { id: fresh.id }, include });
        mocks.sendMessage.mockResolvedValue({
          text: JSON.stringify({ ...STRATEGY, loadRecommendation: '60kg' }),
        });
        const calls = mocks.sendMessage.mock.calls.length;
        expect(
          (await app.inject({ method: 'POST', url: `${url}/strategy`, headers })).statusCode,
        ).toBe(502);
        expect(mocks.sendMessage.mock.calls.length - calls).toBe(2);
        expect(await prisma.wod.findUniqueOrThrow({ where: { id: fresh.id }, include })).toEqual(
          before,
        );
        expect(await prisma.wodGenerationLease.count({ where: { wodId: fresh.id } })).toBe(0);
      } finally {
        await prisma.wod.delete({ where: { id: fresh.id } });
      }
    });

    it(`rejects source mismatches without changing real data (reanalysis: ${reanalysis})`, async () => {
      const fresh = await prisma.wod.create({
        data: {
          userId: 'version-legacy-user',
          date: new Date(),
          sourceType: 'TEXT',
          rawText: simpleSourceCase.rawText,
        },
      });
      const url = `/api/wods/${fresh.id}`;
      const include = {
        analysis: { include: { movements: true } },
        strategy: true,
        analysisVersions: true,
        strategyVersions: true,
        result: true,
      } as const;
      try {
        if (reanalysis) {
          mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(simpleSourceCase.analysis) });
          expect(
            (await app.inject({ method: 'POST', url: `${url}/analyze`, headers })).statusCode,
          ).toBe(200);
          mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(STRATEGY) });
          expect(
            (await app.inject({ method: 'POST', url: `${url}/strategy`, headers })).statusCode,
          ).toBe(200);
        }
        const before = await prisma.wod.findUniqueOrThrow({ where: { id: fresh.id }, include });
        for (const fault of ['omission', 'volume']) {
          const analysis = structuredClone(simpleSourceCase.analysis);
          if (fault === 'omission') analysis.movements.shift();
          else analysis.movements[0]!.reps = 100;
          mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(analysis) });
          const calls = mocks.sendMessage.mock.calls.length;
          expect(
            (await app.inject({ method: 'POST', url: `${url}/analyze`, headers })).statusCode,
          ).toBe(502);
          expect(mocks.sendMessage.mock.calls.length - calls).toBe(2);
          expect(await prisma.wod.findUniqueOrThrow({ where: { id: fresh.id }, include })).toEqual(
            before,
          );
          expect(await prisma.wodGenerationLease.count({ where: { wodId: fresh.id } })).toBe(0);
        }
      } finally {
        await prisma.wod.delete({ where: { id: fresh.id } });
      }
    });

    it(`rejects inconsistent totals without changing real data (reanalysis: ${reanalysis})`, async () => {
      const fresh = await prisma.wod.create({
        data: {
          userId: 'version-legacy-user',
          date: new Date(),
          sourceType: 'TEXT',
          rawText: 'AMRAP 15: 10 T2B',
        },
      });
      const url = `/api/wods/${fresh.id}`;
      const include = {
        analysis: { include: { movements: true } },
        strategy: true,
        analysisVersions: true,
        strategyVersions: true,
        result: true,
      } as const;
      try {
        if (reanalysis) {
          mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(ANALYSIS) });
          expect(
            (await app.inject({ method: 'POST', url: `${url}/analyze`, headers })).statusCode,
          ).toBe(200);
          mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(STRATEGY) });
          expect(
            (await app.inject({ method: 'POST', url: `${url}/strategy`, headers })).statusCode,
          ).toBe(200);
        }
        const before = await prisma.wod.findUniqueOrThrow({ where: { id: fresh.id }, include });
        mocks.sendMessage.mockResolvedValue({
          text: JSON.stringify({
            ...ANALYSIS,
            movements: [{ ...ANALYSIS.movements[0], reps: 100 }],
          }),
        });
        const calls = mocks.sendMessage.mock.calls.length;
        expect(
          (await app.inject({ method: 'POST', url: `${url}/analyze`, headers })).statusCode,
        ).toBe(502);
        expect(mocks.sendMessage.mock.calls.length - calls).toBe(2);
        expect(await prisma.wod.findUniqueOrThrow({ where: { id: fresh.id }, include })).toEqual(
          before,
        );
        expect(await prisma.wodGenerationLease.count({ where: { wodId: fresh.id } })).toBe(0);
      } finally {
        await prisma.wod.delete({ where: { id: fresh.id } });
      }
    });

    it.each([null, [{ roundNumber: 1, movements: ANALYSIS.movements }]])(
      `preserves real data when fixed rounds are missing (reanalysis: ${reanalysis}): %j`,
      async (rounds) => {
        const fresh = await prisma.wod.create({
          data: {
            userId: 'version-legacy-user',
            date: new Date(),
            sourceType: 'TEXT',
            rawText: '3 rounds de 10 T2B',
          },
        });
        const complete = {
          ...ANALYSIS,
          format: 'ROUNDS_FOR_TIME',
          movements: [{ name: 'Toes to Bar', category: 'gymnastics', reps: 30 }],
          rounds: Array.from({ length: 3 }, (_, index) => ({
            roundNumber: index + 1,
            movements: ANALYSIS.movements,
          })),
        };
        const url = `/api/wods/${fresh.id}`;
        try {
          if (reanalysis) {
            mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(complete) });
            expect(
              (await app.inject({ method: 'POST', url: `${url}/analyze`, headers })).statusCode,
            ).toBe(200);
            mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(STRATEGY) });
            expect(
              (await app.inject({ method: 'POST', url: `${url}/strategy`, headers })).statusCode,
            ).toBe(200);
          }
          const before = await prisma.wod.findUniqueOrThrow({
            where: { id: fresh.id },
            include: {
              analysis: { include: { movements: true } },
              strategy: true,
              analysisVersions: true,
              strategyVersions: true,
            },
          });
          mocks.sendMessage.mockResolvedValue({ text: JSON.stringify({ ...complete, rounds }) });
          expect(
            (await app.inject({ method: 'POST', url: `${url}/analyze`, headers })).statusCode,
          ).toBe(502);
          expect(
            await prisma.wod.findUniqueOrThrow({
              where: { id: fresh.id },
              include: {
                analysis: { include: { movements: true } },
                strategy: true,
                analysisVersions: true,
                strategyVersions: true,
              },
            }),
          ).toEqual(before);
        } finally {
          await prisma.wod.delete({ where: { id: fresh.id } });
        }
      },
    );

    it.each([{ movements: [] }, { rounds: [{ roundNumber: 1, movements: [] }] }])(
      `does not persist empty analysis on PostgreSQL (reanalysis: ${reanalysis}): %j`,
      async (empty) => {
        const fresh = await prisma.wod.create({
          data: {
            userId: 'version-legacy-user',
            date: new Date(),
            sourceType: 'TEXT',
            rawText: 'AMRAP 15: 10 T2B',
          },
        });
        const url = `/api/wods/${fresh.id}`;
        try {
          if (reanalysis) {
            mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(ANALYSIS) });
            expect(
              (await app.inject({ method: 'POST', url: `${url}/analyze`, headers })).statusCode,
            ).toBe(200);
            mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(STRATEGY) });
            expect(
              (await app.inject({ method: 'POST', url: `${url}/strategy`, headers })).statusCode,
            ).toBe(200);
          }
          const before = await prisma.wod.findUniqueOrThrow({
            where: { id: fresh.id },
            include: {
              analysis: { include: { movements: true } },
              strategy: true,
              analysisVersions: true,
              strategyVersions: true,
            },
          });
          mocks.sendMessage.mockResolvedValue({ text: JSON.stringify({ ...ANALYSIS, ...empty }) });
          const calls = mocks.sendMessage.mock.calls.length;
          expect(
            (await app.inject({ method: 'POST', url: `${url}/analyze`, headers })).statusCode,
          ).toBe(502);
          expect(mocks.sendMessage.mock.calls.length - calls).toBe(2);
          expect(
            await prisma.wod.findUniqueOrThrow({
              where: { id: fresh.id },
              include: {
                analysis: { include: { movements: true } },
                strategy: true,
                analysisVersions: true,
                strategyVersions: true,
              },
            }),
          ).toEqual(before);
        } finally {
          await prisma.wod.delete({ where: { id: fresh.id } });
        }
      },
    );
  }

  it.each([false, true])(
    'persists corrected or supported load guidance in PostgreSQL (load PR: %s)',
    async (supported) => {
      const fresh = await prisma.wod.create({
        data: {
          userId: 'version-legacy-user',
          date: new Date(),
          sourceType: 'TEXT',
          rawText: 'AMRAP 15: 10 T2B',
        },
      });
      const record = supported
        ? await prisma.personalRecord.create({
            data: {
              userId: 'version-legacy-user',
              movementName: 'Toes to Bar',
              value: 40,
              unit: 'kg',
            },
          })
        : null;
      const url = `/api/wods/${fresh.id}`;
      try {
        mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(ANALYSIS) });
        expect(
          (await app.inject({ method: 'POST', url: `${url}/analyze`, headers })).statusCode,
        ).toBe(200);
        const loadRecommendation = supported ? 'Toes to Bar: 20kg (50%) (PR 40kg)' : null;
        mocks.sendMessage.mockReset();
        if (!supported) {
          mocks.sendMessage.mockResolvedValueOnce({
            text: JSON.stringify({ ...STRATEGY, loadRecommendation: '60kg' }),
          });
        }
        mocks.sendMessage.mockResolvedValueOnce({
          text: JSON.stringify({
            ...STRATEGY,
            loadRecommendation,
            loadCalculations: supported
              ? [
                  {
                    movement: 'Toes to Bar',
                    prValue: 40,
                    prUnit: 'kg',
                    loads: [{ value: 20, unit: 'kg', percentage: 50 }],
                  },
                ]
              : [],
          }),
        });
        expect(
          (await app.inject({ method: 'POST', url: `${url}/strategy`, headers })).statusCode,
        ).toBe(200);
        expect(mocks.sendMessage).toHaveBeenCalledTimes(supported ? 1 : 2);
        const strategy = await prisma.wodStrategy.findUniqueOrThrow({ where: { wodId: fresh.id } });
        expect(strategy.loadRecommendation).toBe(loadRecommendation);
        const versions = await prisma.wodStrategyVersion.findMany({ where: { wodId: fresh.id } });
        expect(versions).toHaveLength(1);
        expect(versions[0].snapshot).toMatchObject({ loadRecommendation });
        expect(versions[0].snapshot).not.toHaveProperty('loadCalculations');
        if (supported) {
          expect(versions[0].inputSnapshot).toMatchObject({
            athleteContext: {
              relevantPersonalRecords: expect.arrayContaining([
                expect.objectContaining({
                  movementName: 'Toes to Bar',
                  value: 40,
                  unit: 'kg',
                }),
              ]),
            },
          });
        }
        expect(await prisma.wodGenerationLease.count({ where: { wodId: fresh.id } })).toBe(0);
      } finally {
        if (record) await prisma.personalRecord.delete({ where: { id: record.id } });
        await prisma.wod.delete({ where: { id: fresh.id } });
      }
    },
  );

  it.each([false, true])(
    'preserves PostgreSQL strategy after invalid load evidence (reanalysis: %s)',
    async (reanalysis) => {
      const fresh = await prisma.wod.create({
        data: {
          userId: 'version-legacy-user',
          date: new Date(),
          sourceType: 'TEXT',
          rawText: 'AMRAP 15: 10 T2B + 10 Thruster',
        },
      });
      const record = await prisma.personalRecord.create({
        data: {
          userId: 'version-legacy-user',
          movementName: 'Toes to Bar',
          value: 40,
          unit: 'kg',
        },
      });
      const movements = [
        ...ANALYSIS.movements,
        { name: 'Thruster', category: 'weightlifting', reps: 10 },
      ];
      const analysis = { ...ANALYSIS, movements, rounds: [{ roundNumber: 1, movements }] };
      const url = `/api/wods/${fresh.id}`;
      const include = {
        analysis: { include: { movements: true } },
        strategy: true,
        analysisVersions: true,
        strategyVersions: true,
        result: true,
      } as const;
      try {
        for (let index = 0; index < (reanalysis ? 2 : 1); index++) {
          mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(analysis) });
          expect(
            (await app.inject({ method: 'POST', url: `${url}/analyze`, headers })).statusCode,
          ).toBe(200);
          mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(STRATEGY) });
          expect(
            (await app.inject({ method: 'POST', url: `${url}/strategy`, headers })).statusCode,
          ).toBe(200);
        }
        const before = await prisma.wod.findUniqueOrThrow({ where: { id: fresh.id }, include });
        for (const fault of [
          'borrowed PR',
          'invented PR',
          'percentage',
          'text mismatch',
          'free field',
        ]) {
          const movement = fault === 'borrowed PR' ? 'Thruster' : 'Toes to Bar';
          const prValue = fault === 'invented PR' ? 80 : 40;
          const value = fault === 'percentage' ? 30 : 20;
          const text =
            fault === 'text mismatch'
              ? 'Toes to Bar: 30kg (PR 40kg)'
              : `${movement}: ${value}kg (50%) (PR ${prValue}kg)`;
          mocks.sendMessage.mockResolvedValue({
            text: JSON.stringify({
              ...STRATEGY,
              ...(fault === 'free field' ? { pacing: 'Use 20kg.' } : {}),
              loadRecommendation: text,
              loadCalculations: [
                { movement, prValue, prUnit: 'kg', loads: [{ value, unit: 'kg', percentage: 50 }] },
              ],
            }),
          });
          const calls = mocks.sendMessage.mock.calls.length;
          expect(
            (await app.inject({ method: 'POST', url: `${url}/strategy`, headers })).statusCode,
          ).toBe(502);
          expect(mocks.sendMessage.mock.calls.length - calls).toBe(2);
          expect(await prisma.wod.findUniqueOrThrow({ where: { id: fresh.id }, include })).toEqual(
            before,
          );
          expect(await prisma.wodGenerationLease.count({ where: { wodId: fresh.id } })).toBe(0);
        }
      } finally {
        await prisma.personalRecord.delete({ where: { id: record.id } });
        await prisma.wod.delete({ where: { id: fresh.id } });
      }
    },
  );

  it('checks block percentages and explicit adaptation with a real aliased PR', async () => {
    const fixture = wodFormatCases.find((item) => item.name === 'STRENGTH percentages')!;
    const fresh = await prisma.wod.create({
      data: {
        userId: 'version-legacy-user',
        date: new Date(),
        sourceType: 'TEXT',
        rawText: fixture.rawText,
      },
    });
    const record = await prisma.personalRecord.create({
      data: {
        userId: 'version-legacy-user',
        movementName: 'Back-Squats',
        value: 100,
        unit: 'kg',
      },
    });
    const url = `/api/wods/${fresh.id}`;
    const include = {
      analysis: { include: { movements: true } },
      strategy: true,
      analysisVersions: true,
      strategyVersions: true,
      result: true,
    } as const;
    const warning = 'Confirme com o coach se o PR informado representa 1RM.';
    const reason = 'Carga adaptada para reduzir a demanda neste treino.';
    try {
      mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(fixture.analysis) });
      expect(
        (await app.inject({ method: 'POST', url: `${url}/analyze`, headers })).statusCode,
      ).toBe(200);
      mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(STRATEGY) });
      expect(
        (await app.inject({ method: 'POST', url: `${url}/strategy`, headers })).statusCode,
      ).toBe(200);
      const before = await prisma.wod.findUniqueOrThrow({ where: { id: fresh.id }, include });
      mocks.sendMessage.mockResolvedValue({
        text: JSON.stringify({
          ...STRATEGY,
          warnings: [warning],
          loadRecommendation: 'Back Squat: 70kg (70%) / 80kg (80%) / 85kg (85%) (PR 100kg)',
          loadCalculations: [
            {
              movement: 'Back Squat',
              prValue: 100,
              prUnit: 'kg',
              loads: [70, 80, 85].map((p) => ({ value: p, unit: 'kg', percentage: p })),
            },
          ],
        }),
      });
      const untypedCalls = mocks.sendMessage.mock.calls.length;
      expect(
        (await app.inject({ method: 'POST', url: `${url}/strategy`, headers })).statusCode,
      ).toBe(502);
      expect(mocks.sendMessage.mock.calls.length - untypedCalls).toBe(2);
      expect(await prisma.wod.findUniqueOrThrow({ where: { id: fresh.id }, include })).toEqual(
        before,
      );
      expect(await prisma.wodGenerationLease.count({ where: { wodId: fresh.id } })).toBe(0);
      await prisma.personalRecord.update({
        where: { id: record.id },
        data: { recordType: 'ONE_RM' },
      });
      for (const fault of ['order', 'missing block', 'unannounced adaptation']) {
        const percentages = fault === 'order' ? [85, 80, 70] : [70];
        const adapted = fault === 'unannounced adaptation';
        const output = {
          ...STRATEGY,
          warnings: [warning],
          loadRecommendation: `Back Squat${adapted ? ' (adaptado)' : ''}: ${percentages.map((p) => `${p}kg (${p}%)`).join(' / ')} (PR 100kg)`,
          loadCalculations: [
            {
              movement: 'Back Squat',
              prValue: 100,
              prUnit: 'kg',
              ...(adapted ? { prescriptionMode: 'adapted', adaptationReason: reason } : {}),
              loads: percentages.map((p) => ({ value: p, unit: 'kg', percentage: p })),
            },
          ],
        };
        mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(output) });
        const calls = mocks.sendMessage.mock.calls.length;
        expect(
          (await app.inject({ method: 'POST', url: `${url}/strategy`, headers })).statusCode,
        ).toBe(502);
        expect(mocks.sendMessage.mock.calls.length - calls).toBe(2);
        expect(await prisma.wod.findUniqueOrThrow({ where: { id: fresh.id }, include })).toEqual(
          before,
        );
        expect(await prisma.wodGenerationLease.count({ where: { wodId: fresh.id } })).toBe(0);
      }
      for (const adapted of [false, true]) {
        const percentages = adapted ? [50] : [70, 80, 85];
        const output = {
          ...STRATEGY,
          warnings: adapted ? [warning, reason] : [warning],
          loadRecommendation: `Back Squat${adapted ? ' (adaptado)' : ''}: ${percentages.map((p) => `${p}kg (${p}%)`).join(' / ')} (PR 100kg)`,
          loadCalculations: [
            {
              movement: 'Back Squat',
              prValue: 100,
              prUnit: 'kg',
              ...(adapted ? { prescriptionMode: 'adapted', adaptationReason: reason } : {}),
              loads: percentages.map((p) => ({ value: p, unit: 'kg', percentage: p })),
            },
          ],
        };
        mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(output) });
        expect(
          (await app.inject({ method: 'POST', url: `${url}/strategy`, headers })).statusCode,
        ).toBe(200);
        const saved = await prisma.wodStrategyVersion.findFirstOrThrow({
          where: { wodId: fresh.id },
          orderBy: { version: 'desc' },
        });
        expect(saved.snapshot).toMatchObject({
          loadRecommendation: output.loadRecommendation,
          rawResponse: { loadRecommendation: output.loadRecommendation },
        });
        expect(JSON.stringify(saved.snapshot)).not.toContain('loadCalculations');
        expect(saved.inputSnapshot).toMatchObject({
          athleteContext: {
            relevantPersonalRecords: [
              expect.objectContaining({
                movementName: 'Back-Squats',
                recordType: 'ONE_RM',
                repetitions: null,
              }),
            ],
          },
        });
      }
    } finally {
      await prisma.personalRecord.delete({ where: { id: record.id } });
      await prisma.wod.delete({ where: { id: fresh.id } });
    }
  });

  it('creates and edits PR classifications while preserving typed records for older clients', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/personal-records',
      headers,
      payload: {
        movementName: 'Test lift',
        value: 100,
        unit: 'kg',
        recordType: 'REP_MAX',
        repetitions: 5,
      },
    });
    expect(created.statusCode).toBe(201);
    const record = created.json().record;
    try {
      expect(record).toMatchObject({ recordType: 'REP_MAX', repetitions: 5 });
      const url = `/api/personal-records/${record.id}`;
      const input = { movementName: 'Test lift', value: 110, unit: 'kg' };
      expect(
        (await app.inject({ method: 'PUT', url, headers, payload: input })).json().record,
      ).toMatchObject({
        value: 110,
        recordType: 'REP_MAX',
        repetitions: 5,
      });
      const before = await prisma.personalRecord.findUniqueOrThrow({ where: { id: record.id } });
      const foreignToken = [{ alg: 'HS256', typ: 'JWT' }, { sub: 'other-athlete' }]
        .map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'))
        .join('.');
      const foreignHeaders = {
        authorization: `Bearer ${foreignToken}.${createHmac('sha256', process.env.JWT_SECRET!).update(foreignToken).digest('base64url')}`,
      };
      for (const method of ['PUT', 'DELETE'] as const) {
        expect(
          (
            await app.inject({
              method,
              url,
              headers: foreignHeaders,
              ...(method === 'PUT' ? { payload: input } : {}),
            })
          ).statusCode,
        ).toBe(404);
        expect(await prisma.personalRecord.findUniqueOrThrow({ where: { id: record.id } })).toEqual(
          before,
        );
      }
      for (const change of [
        { unit: 'reps' },
        { recordType: 'ONE_RM' },
        { recordType: 'REP_MAX', repetitions: 1 },
      ]) {
        expect(
          (await app.inject({ method: 'PUT', url, headers, payload: { ...input, ...change } }))
            .statusCode,
        ).toBe(400);
        expect(await prisma.personalRecord.findUniqueOrThrow({ where: { id: record.id } })).toEqual(
          before,
        );
      }
      expect(
        (
          await app.inject({
            method: 'PUT',
            url,
            headers,
            payload: { ...input, recordType: 'ONE_RM', repetitions: null },
          })
        ).json().record,
      ).toMatchObject({ recordType: 'ONE_RM', repetitions: null });
      expect(
        (await app.inject({ method: 'PUT', url, headers, payload: input })).json().record,
      ).toMatchObject({ recordType: 'ONE_RM', repetitions: null });
      expect(
        (await app.inject({ method: 'GET', url: '/api/personal-records', headers })).json().records,
      ).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: record.id, recordType: 'ONE_RM' })]),
      );
    } finally {
      await prisma.personalRecord.delete({ where: { id: record.id } });
    }
  });

  it.each(['duration edit', 'text edit'] as const)(
    'keeps strategy context and structure on the same target snapshot during %s',
    async (change) => {
      const fresh = await prisma.wod.create({
        data: {
          userId: 'version-legacy-user',
          date: new Date(),
          sourceType: 'TEXT',
          rawText: 'AMRAP 15: 10 T2B',
        },
      });
      const url = `/api/wods/${fresh.id}`;
      let release = () => {};
      let started = () => {};
      const observed = new Promise<void>((resolve) => {
        started = resolve;
      });
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      const personalRecord = await prisma.personalRecord.create({
        data: {
          userId: 'version-legacy-user',
          movementName: 'Toes to Bar',
          value: 22,
          unit: 'reps',
        },
      });
      try {
        mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(ANALYSIS) });
        expect(
          (await app.inject({ method: 'POST', url: `${url}/analyze`, headers })).statusCode,
        ).toBe(200);
        const oldAnalysis = await prisma.wodAnalysis.findUniqueOrThrow({
          where: { wodId: fresh.id },
        });
        const contextResponse = await app.inject({ method: 'GET', url: `${url}/context`, headers });
        expect(contextResponse.statusCode).toBe(200);
        const originalContext = contextResponse.json().context;
        expect(originalContext.relevantPersonalRecords).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ movementName: 'Toes to Bar', value: 22 }),
          ]),
        );
        mocks.pauseTarget = async () => {
          started();
          await barrier;
        };
        const pending = app.inject({ method: 'POST', url: `${url}/strategy`, headers });
        await observed;
        if (change === 'duration edit') {
          expect(
            (
              await app.inject({
                method: 'PATCH',
                url: `${url}/analysis`,
                headers,
                payload: { durationMinutes: 12 },
              })
            ).statusCode,
          ).toBe(200);
        } else {
          expect(
            (
              await app.inject({
                method: 'PUT',
                url,
                headers,
                payload: { rawText: 'AMRAP 10: 5 Burpees' },
              })
            ).statusCode,
          ).toBe(200);
        }
        const before = await prisma.wod.findUniqueOrThrow({
          where: { id: fresh.id },
          include: {
            analysis: true,
            strategy: true,
            analysisVersions: true,
            strategyVersions: true,
          },
        });
        mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(STRATEGY) });
        release();
        expect((await pending).statusCode).toBe(409);
        const prompt = mocks.sendMessage.mock.calls.at(-1)![0].messages[0].content[0].text;
        const input = JSON.parse(prompt.slice(prompt.indexOf('{')));
        expect(input.wodAnalysis.durationMinutes).toBe(oldAnalysis.durationMinutes);
        expect(input.wodAnalysis.movements).toEqual([
          expect.objectContaining({ name: 'Toes to Bar' }),
        ]);
        expect(input.athleteContext).toEqual(originalContext);
        expect(
          await prisma.wod.findUniqueOrThrow({
            where: { id: fresh.id },
            include: {
              analysis: true,
              strategy: true,
              analysisVersions: true,
              strategyVersions: true,
            },
          }),
        ).toEqual(before);
      } finally {
        release();
        mocks.pauseTarget = null;
        await prisma.personalRecord.delete({ where: { id: personalRecord.id } });
        await prisma.wod.delete({ where: { id: fresh.id } });
      }
    },
  );

  for (const reanalysis of [false, true]) {
    for (const operation of ['analyze', 'strategy'] as const) {
      it.each(['incomplete', 'timeout'] as const)(
        `preserves PostgreSQL state on HTTP %s during ${operation} (reanalysis: ${reanalysis})`,
        async (failure) => {
          const fresh = await prisma.wod.create({
            data: {
              userId: 'version-legacy-user',
              date: new Date(),
              sourceType: 'TEXT',
              rawText: 'AMRAP 15: 10 T2B',
            },
          });
          const url = `/api/wods/${fresh.id}`;
          const include = {
            analysis: { include: { movements: true } },
            strategy: true,
            analysisVersions: true,
            strategyVersions: true,
          };
          try {
            mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(ANALYSIS) });
            if (reanalysis || operation === 'strategy') {
              expect(
                (await app.inject({ method: 'POST', url: `${url}/analyze`, headers })).statusCode,
              ).toBe(200);
            }
            if (reanalysis) {
              mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(STRATEGY) });
              expect(
                (await app.inject({ method: 'POST', url: `${url}/strategy`, headers })).statusCode,
              ).toBe(200);
              if (operation === 'strategy') {
                mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(ANALYSIS) });
                expect(
                  (await app.inject({ method: 'POST', url: `${url}/analyze`, headers })).statusCode,
                ).toBe(200);
              }
            }
            const before = await prisma.wod.findUniqueOrThrow({ where: { id: fresh.id }, include });
            const transport = await vi.importActual<typeof import('@wod-coach-ai/ai')>(
              '../../packages/ai/dist/index.js',
            );
            let started = () => {};
            const observed = new Promise<void>((resolve) => {
              started = resolve;
            });
            const fetchMock = vi.fn().mockImplementation((_url, options: RequestInit) => {
              started();
              if (failure === 'timeout') {
                return new Promise((_resolve, reject) =>
                  options.signal!.addEventListener('abort', () => reject(options.signal!.reason), {
                    once: true,
                  }),
                );
              }
              return Promise.resolve(
                new Response(
                  JSON.stringify({
                    status: 'incomplete',
                    incomplete_details: { reason: 'max_output_tokens' },
                    output_text: JSON.stringify(operation === 'analyze' ? ANALYSIS : STRATEGY),
                  }),
                ),
              );
            });
            vi.stubGlobal('fetch', fetchMock);
            if (failure === 'timeout') vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
            mocks.sendMessage.mockImplementation(transport.createOpenAiMessageSender('test-key'));
            const pending = app.inject({ method: 'POST', url: `${url}/${operation}`, headers });
            await observed;
            if (failure === 'timeout') await vi.advanceTimersByTimeAsync(120_000);
            expect((await pending).statusCode).toBe(failure === 'timeout' ? 504 : 502);
            vi.useRealTimers();
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(
              await prisma.wod.findUniqueOrThrow({ where: { id: fresh.id }, include }),
            ).toEqual(before);
          } finally {
            vi.useRealTimers();
            vi.unstubAllGlobals();
            await prisma.wod.delete({ where: { id: fresh.id } });
          }
        },
      );
    }
  }

  for (const reanalysis of [false, true]) {
    it.each([false, true])(
      `archives provider metadata and distinguishes manual edits (reanalysis: ${reanalysis}, partial usage: %s)`,
      async (partialUsage) => {
        const fresh = await prisma.wod.create({
          data: {
            userId: 'version-legacy-user',
            date: new Date(),
            sourceType: 'TEXT',
            rawText: 'AMRAP 15: 10 T2B',
          },
        });
        const url = `/api/wods/${fresh.id}`;
        try {
          if (reanalysis) {
            mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(ANALYSIS) });
            expect(
              (await app.inject({ method: 'POST', url: `${url}/analyze`, headers })).statusCode,
            ).toBe(200);
            mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(STRATEGY) });
            expect(
              (await app.inject({ method: 'POST', url: `${url}/strategy`, headers })).statusCode,
            ).toBe(200);
          }
          const oldAnalyses = await prisma.wodAnalysisVersion.findMany({
            where: { wodId: fresh.id },
            orderBy: { version: 'asc' },
          });
          const oldStrategies = await prisma.wodStrategyVersion.findMany({
            where: { wodId: fresh.id },
            orderBy: { version: 'asc' },
          });
          const transport = await vi.importActual<typeof import('@wod-coach-ai/ai')>(
            '../../packages/ai/dist/index.js',
          );
          const bodies = [
            {
              status: 'completed',
              id: 'resp-analysis-invalid',
              model: 'gpt-5-mini-snapshot',
              output_text: 'invalid json',
              usage: partialUsage
                ? undefined
                : { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
            },
            {
              status: 'completed',
              id: 'resp-analysis-valid',
              model: 'gpt-5-mini-snapshot',
              output_text: JSON.stringify(ANALYSIS),
              usage: { input_tokens: 150, output_tokens: 30, total_tokens: 180 },
            },
            {
              status: 'completed',
              id: 'resp-strategy-invalid',
              model: 'gpt-5-mini-snapshot',
              output_text: 'invalid json',
              usage: { input_tokens: 200, output_tokens: 40, total_tokens: 240 },
            },
            {
              status: 'completed',
              id: 'resp-strategy-valid',
              model: 'gpt-5-mini-snapshot',
              output_text: JSON.stringify(STRATEGY),
              usage: { input_tokens: 250, output_tokens: 50, total_tokens: 300 },
            },
          ];
          const fetchMock = vi.fn();
          for (const body of bodies)
            fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body)));
          vi.stubGlobal('fetch', fetchMock);
          mocks.sendMessage.mockImplementation(transport.createOpenAiMessageSender('test-key'));
          expect(
            (await app.inject({ method: 'POST', url: `${url}/analyze`, headers })).statusCode,
          ).toBe(200);
          expect(
            (await app.inject({ method: 'POST', url: `${url}/strategy`, headers })).statusCode,
          ).toBe(200);
          expect(fetchMock).toHaveBeenCalledTimes(4);
          const versionsResponse = await app.inject({
            method: 'GET',
            url: `${url}/versions`,
            headers,
          });
          expect(versionsResponse.statusCode).toBe(200);
          const versions = versionsResponse.json();
          const analysisMetadata = versions.analysisVersions[0].snapshot.generationMetadata;
          const strategyMetadata = versions.strategyVersions[0].snapshot.generationMetadata;
          expect(analysisMetadata).toMatchObject({
            schemaVersion: 1,
            agent: 'WodAnalyzerAgent',
            provider: 'openai',
            attempts: [
              {
                attempt: 1,
                requestedModel: 'gpt-5-mini',
                model: 'gpt-5-mini-snapshot',
                responseId: 'resp-analysis-invalid',
                promptVersion: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
                usage: partialUsage
                  ? null
                  : { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
              },
              { attempt: 2, responseId: 'resp-analysis-valid' },
            ],
            totalUsage: partialUsage
              ? null
              : { inputTokens: 250, outputTokens: 50, totalTokens: 300 },
          });
          expect(strategyMetadata).toMatchObject({
            agent: 'StrategyCoachAgent',
            attempts: [
              { responseId: 'resp-strategy-invalid' },
              { responseId: 'resp-strategy-valid' },
            ],
            totalUsage: { inputTokens: 450, outputTokens: 90, totalTokens: 540 },
          });
          expect(strategyMetadata.attempts[0].promptVersion).not.toBe(
            analysisMetadata.attempts[0].promptVersion,
          );
          expect(versions.strategyVersions[0].analysisVersionId).toBe(
            versions.analysisVersions[0].id,
          );
          const savedAnalyses = await prisma.wodAnalysisVersion.findMany({
            where: { wodId: fresh.id },
            orderBy: { version: 'asc' },
          });
          const savedStrategies = await prisma.wodStrategyVersion.findMany({
            where: { wodId: fresh.id },
            orderBy: { version: 'asc' },
          });
          expect(savedAnalyses.slice(0, -1)).toEqual(oldAnalyses);
          expect(savedStrategies.slice(0, -1)).toEqual(oldStrategies);
          expect(
            (
              await app.inject({
                method: 'PATCH',
                url: `${url}/analysis`,
                headers,
                payload: { durationMinutes: 18 },
              })
            ).statusCode,
          ).toBe(200);
          const edited = await prisma.wodAnalysisVersion.findFirstOrThrow({
            where: { wodId: fresh.id },
            orderBy: { version: 'desc' },
          });
          expect(edited).toMatchObject({
            reason: 'DURATION_EDIT',
            snapshot: { generationMetadata: null },
          });
          expect(
            (
              await prisma.wodAnalysisVersion.findMany({
                where: { wodId: fresh.id },
                orderBy: { version: 'asc' },
              })
            ).slice(0, -1),
          ).toEqual(savedAnalyses);
          expect(
            await prisma.wodStrategyVersion.findMany({
              where: { wodId: fresh.id },
              orderBy: { version: 'asc' },
            }),
          ).toEqual(savedStrategies);
          expect(fetchMock).toHaveBeenCalledTimes(4);
        } finally {
          vi.unstubAllGlobals();
          await prisma.wod.delete({ where: { id: fresh.id } });
        }
      },
    );
  }

  it.each(['initial', 'reanalysis', 'image'] as const)(
    'rejects stale %s analysis after a real WOD edit and preserves history',
    async (scenario) => {
      const fresh = await prisma.wod.create({
        data: {
          userId: 'version-legacy-user',
          date: new Date(),
          sourceType: scenario === 'image' ? 'IMAGE' : 'TEXT',
          rawText: scenario === 'image' ? null : 'AMRAP 15: 10 T2B',
          imageData: scenario === 'image' ? 'image-base64' : null,
          imageMimeType: scenario === 'image' ? 'image/png' : null,
        },
      });
      const url = `/api/wods/${fresh.id}`;
      mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(ANALYSIS) });
      try {
        if (scenario === 'reanalysis') {
          expect(
            (await app.inject({ method: 'POST', url: `${url}/analyze`, headers })).statusCode,
          ).toBe(200);
          mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(STRATEGY) });
          expect(
            (await app.inject({ method: 'POST', url: `${url}/strategy`, headers })).statusCode,
          ).toBe(200);
        }
        const history = await prisma.wodAnalysisVersion.findMany({ where: { wodId: fresh.id } });
        const strategies = await prisma.wodStrategyVersion.findMany({ where: { wodId: fresh.id } });
        let release: (value: { text: string }) => void = () => {};
        let started: () => void = () => {};
        const observed = new Promise<void>((resolve) => {
          started = resolve;
        });
        mocks.sendMessage.mockImplementationOnce(() => {
          started();
          return new Promise((resolve) => {
            release = resolve;
          });
        });
        const pending = app.inject({ method: 'POST', url: `${url}/analyze`, headers });
        await observed;
        expect(
          (
            await app.inject({
              method: 'PUT',
              url,
              headers,
              payload: { rawText: 'AMRAP 10: 5 Burpees' },
            })
          ).statusCode,
        ).toBe(200);
        const edited = await prisma.wod.findUniqueOrThrow({ where: { id: fresh.id } });
        release({ text: JSON.stringify({ ...ANALYSIS, extractedText: 'AMRAP 15: 10 T2B' }) });
        expect((await pending).statusCode).toBe(409);
        expect(await prisma.wod.findUniqueOrThrow({ where: { id: fresh.id } })).toEqual(edited);
        expect(await prisma.wodAnalysis.findUnique({ where: { wodId: fresh.id } })).toBeNull();
        expect(await prisma.wodStrategy.findUnique({ where: { wodId: fresh.id } })).toBeNull();
        expect(await prisma.wodAnalysisVersion.findMany({ where: { wodId: fresh.id } })).toEqual(
          history,
        );
        expect(await prisma.wodStrategyVersion.findMany({ where: { wodId: fresh.id } })).toEqual(
          strategies,
        );
      } finally {
        await prisma.wod.delete({ where: { id: fresh.id } });
      }
    },
  );
});
