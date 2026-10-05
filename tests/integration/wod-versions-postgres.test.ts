import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../packages/database/dist/index.js';
import { buildApp } from '../../apps/api/src/app.js';

const mocks = vi.hoisted(() => ({ sendMessage: vi.fn() }));
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

  it('allocates distinct version numbers for simultaneous analyses on a new WOD', async () => {
    const fresh = await prisma.wod.create({
      data: {
        userId: 'version-legacy-user',
        date: new Date(),
        sourceType: 'TEXT',
        rawText: 'AMRAP 15: 10 T2B',
      },
    });
    mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(ANALYSIS) });
    try {
      const responses = await Promise.all(
        [1, 2].map(() =>
          app.inject({ method: 'POST', url: `/api/wods/${fresh.id}/analyze`, headers }),
        ),
      );
      expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
      const versions = await prisma.wodAnalysisVersion.findMany({
        where: { wodId: fresh.id },
        orderBy: { version: 'asc' },
      });
      expect(versions.map((version) => version.version)).toEqual([1, 2]);
      expect(
        (await prisma.wodAnalysis.findUniqueOrThrow({ where: { wodId: fresh.id } })).versionId,
      ).toBe(versions[1].id);
    } finally {
      await prisma.wod.delete({ where: { id: fresh.id } });
    }
  });

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
