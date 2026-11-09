import { randomUUID, createHmac } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { prisma } from '../../packages/database/dist/index.js';
import { buildApp } from '../../apps/api/src/app.js';
import {
  claimGenerationJob,
  executeGenerationJob,
} from '../../apps/api/src/services/wod-generation-jobs.js';
import { readAthleteStrategyBasics } from '../../apps/api/src/services/athlete-strategy-basics.js';
import { simpleSourceCase } from '../fixtures/wod-format-cases.js';

const send = vi.hoisted(() => vi.fn());
const sign = (sub: string) => {
  const data = [{ alg: 'HS256', typ: 'JWT' }, { sub }]
    .map((x) => Buffer.from(JSON.stringify(x)).toString('base64url'))
    .join('.');
  return `${data}.${createHmac('sha256', process.env.JWT_SECRET!).update(data).digest('base64url')}`;
};
vi.mock('../../packages/ai/dist/index.js', async (original) => ({
  ...(await original<typeof import('@wod-coach-ai/ai')>()),
  createOpenAiMessageSender: () => send,
}));

describe.skipIf(!process.env.WOD_VERSION_TEST_DATABASE_URL)(
  'performance on isolated PostgreSQL',
  () => {
    let app: ReturnType<typeof buildApp>;
    let owner: string, other: string;
    let headers: { authorization: string; 'x-wod-async': string };
    beforeAll(async () => {
      const url = new URL(process.env.WOD_VERSION_TEST_DATABASE_URL!);
      if (
        url.hostname !== '127.0.0.1' ||
        url.pathname !== '/wod_versions' ||
        url.href !== process.env.DATABASE_URL
      )
        throw Error('Use the disposable version test database');
      vi.stubEnv('WOD_GENERATION_QUEUE_ENABLED', 'true');
      app = buildApp({ backgroundTasks: false });
      await app.ready();
      owner = randomUUID();
      other = randomUUID();
      for (const id of [owner, other])
        await prisma.user.create({
          data: {
            id,
            name: 'Fixture',
            email: `${id}@example.test`,
            passwordHash: 'unused',
            accessStatus: 'APPROVED',
          },
        });
      headers = { authorization: `Bearer ${sign(owner)}`, 'x-wod-async': '1' };
    });
    afterAll(async () => {
      if (owner) await prisma.user.deleteMany({ where: { id: { in: [owner, other] } } });
      if (app) await app.close();
      vi.unstubAllEnvs();
    });
    beforeEach(async () => {
      send.mockReset().mockResolvedValue({ text: JSON.stringify(simpleSourceCase.analysis) });
      await prisma.wodGenerationJob.deleteMany({ where: { userId: owner } });
    });
    const createWod = () =>
      prisma.wod.create({
        data: {
          userId: owner,
          sourceType: 'TEXT',
          discipline: 'CROSSFIT',
          date: new Date(),
          rawText: simpleSourceCase.rawText,
        },
      });
    const enqueue = (id: string) =>
      app.inject({ method: 'POST', url: `/api/wods/${id}/analyze`, headers });
    it('serializes concurrent admission, rejects a synchronous bypass and hides another account jobs', async () => {
      const wod = await createWod();
      const responses = await Promise.all([enqueue(wod.id), enqueue(wod.id)]);
      expect(responses.map((x) => x.statusCode).sort()).toEqual([202, 409]);
      const jobId = responses.find((x) => x.statusCode === 202)!.json().jobId;
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/wods/${wod.id}/analyze`,
            headers: { authorization: headers.authorization },
          })
        ).statusCode,
      ).toBe(409);
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/wod-generation-jobs/${jobId}`,
            headers: { authorization: `Bearer ${sign(other)}` },
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/wods/${wod.id}/analyze`,
            headers: { authorization: `Bearer ${sign(other)}`, 'x-wod-async': '1' },
          })
        ).statusCode,
      ).toBe(404);
      expect(send).not.toHaveBeenCalled();
    });
    it('only one worker claims a pending job and returns one immutable successful analysis', async () => {
      const wod = await createWod();
      const queued = await enqueue(wod.id);
      expect(queued.statusCode).toBe(202);
      const claims = await Promise.all([claimGenerationJob(), claimGenerationJob()]);
      expect(claims.filter(Boolean)).toHaveLength(1);
      await executeGenerationJob(app, claims.find(Boolean)!);
      const response = await app.inject({
        method: 'GET',
        url: `/api/wod-generation-jobs/${queued.json().jobId}`,
        headers,
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.json()).toMatchObject({
        status: 'SUCCEEDED',
        statusCode: 200,
        result: { analysis: { format: simpleSourceCase.analysis.format } },
      });
      expect(JSON.stringify(response.json())).not.toContain('token');
      expect(await prisma.wodAnalysisVersion.count({ where: { wodId: wod.id } })).toBe(1);
      expect(send).toHaveBeenCalledTimes(1);
      expect(await claimGenerationJob()).toBeNull();
    });
    it('does not charge for a source edited while queued', async () => {
      const wod = await createWod();
      await enqueue(wod.id);
      await prisma.wod.update({
        where: { id: wod.id },
        data: { rawText: 'Changed after admission' },
      });
      await executeGenerationJob(app, (await claimGenerationJob())!);
      expect(send).not.toHaveBeenCalled();
      expect(
        await prisma.wodGenerationJob.findFirst({
          where: { wodId: wod.id },
          select: { status: true, statusCode: true },
        }),
      ).toEqual({ status: 'FAILED', statusCode: 409 });
    });
    it('returns compact OCR results without removing the original image from database or archive', async () => {
      const imageData = Buffer.from('private-image-fixture').toString('base64');
      const wod = await prisma.wod.create({
        data: {
          userId: owner,
          sourceType: 'IMAGE',
          discipline: 'CROSSFIT',
          date: new Date(),
          imageData,
          imageMimeType: 'image/png',
        },
      });
      send.mockResolvedValueOnce({
        text: JSON.stringify({
          ...simpleSourceCase.analysis,
          extractedText: simpleSourceCase.rawText,
        }),
      });
      const queued = await enqueue(wod.id);
      expect(queued.statusCode).toBe(202);
      await executeGenerationJob(app, (await claimGenerationJob())!);
      const result = (
        await app.inject({
          method: 'GET',
          url: `/api/wod-generation-jobs/${queued.json().jobId}`,
          headers,
        })
      ).json();
      expect(result).toMatchObject({
        status: 'SUCCEEDED',
        result: { wod: { sourceType: 'TEXT_AND_IMAGE', rawText: simpleSourceCase.rawText } },
      });
      expect(result.result.wod).not.toHaveProperty('imageData');
      expect(
        await prisma.wod.findUnique({ where: { id: wod.id }, select: { imageData: true } }),
      ).toEqual({ imageData });
      const version = await prisma.wodAnalysisVersion.findFirstOrThrow({
        where: { wodId: wod.id },
      });
      expect(version.sourceSnapshot).toMatchObject({ imageData, imageMimeType: 'image/png' });
    });
    it('does not charge a queued strategy after the analysis version changes', async () => {
      const wod = await createWod();
      const generated = await app.inject({
        method: 'POST',
        url: `/api/wods/${wod.id}/analyze`,
        headers: { authorization: headers.authorization },
      });
      expect(generated.statusCode).toBe(200);
      send.mockClear();
      const queued = await app.inject({
        method: 'POST',
        url: `/api/wods/${wod.id}/strategy`,
        headers,
      });
      expect(queued.statusCode).toBe(202);
      const edited = await app.inject({
        method: 'PATCH',
        url: `/api/wods/${wod.id}/analysis`,
        headers,
        payload: { durationMinutes: 14 },
      });
      expect(edited.statusCode).toBe(200);
      await executeGenerationJob(app, (await claimGenerationJob())!);
      expect(send).not.toHaveBeenCalled();
      expect(
        await prisma.wodGenerationJob.findFirst({
          where: { wodId: wod.id },
          select: { statusCode: true },
        }),
      ).toEqual({ statusCode: 409 });
    });
    it('reports an expired pending job even with no worker alive', async () => {
      const wod = await createWod();
      const queued = await enqueue(wod.id);
      const jobId = queued.json().jobId;
      await prisma.wodGenerationJob.update({
        where: { id: jobId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const response = await app.inject({
        method: 'GET',
        url: `/api/wod-generation-jobs/${jobId}`,
        headers,
      });
      expect(response.json()).toMatchObject({ status: 'FAILED', statusCode: 504 });
      expect(send).not.toHaveBeenCalled();
      expect(await claimGenerationJob()).toBeNull();
    });
    it('executes strategy through the worker and archives its exact active analysis', async () => {
      const wod = await createWod();
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/wods/${wod.id}/analyze`,
            headers: { authorization: headers.authorization },
          })
        ).statusCode,
      ).toBe(200);
      const analysis = await prisma.wodAnalysis.findUniqueOrThrow({ where: { wodId: wod.id } });
      send.mockReset().mockResolvedValue({
        text: JSON.stringify({
          recommendedIntensity: 9,
          targetRpe: 10,
          loadRecommendation: null,
          pacing: 'Ritmo constante.',
          breakStrategy: [{ movement: 'Burpee', strategy: '10 direto.' }],
          movementStrategy: [{ movement: 'Run', strategy: 'Ritmo constante.' }],
          restStrategy: 'Pausas curtas.',
          transitionStrategy: 'Rápidas.',
          energyManagement: 'Controle a respiração.',
          goal: 'Completar com consistência.',
          target: 'Buscar ritmo constante.',
          criticalPoint: 'Evitar sprint no início.',
          confidence: 0.8,
          warnings: [],
        }),
      });
      const queued = await app.inject({
        method: 'POST',
        url: `/api/wods/${wod.id}/strategy`,
        headers,
      });
      expect(queued.statusCode).toBe(202);
      await executeGenerationJob(app, (await claimGenerationJob())!);
      const response = await app.inject({
        method: 'GET',
        url: `/api/wod-generation-jobs/${queued.json().jobId}`,
        headers,
      });
      expect(response.json()).toMatchObject({
        status: 'SUCCEEDED',
        statusCode: 200,
        result: { strategy: { targetRpe: 10 } },
      });
      expect(
        await prisma.wodStrategyVersion.findFirst({
          where: { wodId: wod.id },
          select: { analysisVersionId: true },
        }),
      ).toEqual({ analysisVersionId: analysis.versionId });
      expect(send).toHaveBeenCalledTimes(1);
    });
    it('fences a running job expired during the paid call before saving any version', async () => {
      const wod = await createWod();
      await enqueue(wod.id);
      const job = (await claimGenerationJob())!;
      send.mockImplementationOnce(async () => {
        await prisma.wodGenerationJob.update({
          where: { id: job.id },
          data: { expiresAt: new Date(Date.now() - 1000) },
        });
        return { text: JSON.stringify(simpleSourceCase.analysis) };
      });
      await executeGenerationJob(app, job);
      await claimGenerationJob();
      expect(send).toHaveBeenCalledTimes(1);
      expect(await prisma.wodAnalysisVersion.count({ where: { wodId: wod.id } })).toBe(0);
      expect(
        await prisma.wodGenerationJob.findUnique({
          where: { id: job.id },
          select: { status: true, statusCode: true },
        }),
      ).toEqual({ status: 'FAILED', statusCode: 504 });
    });
    it('marks an uncertain provider failure terminal without automatic replay', async () => {
      const wod = await createWod();
      await enqueue(wod.id);
      send.mockRejectedValueOnce(Error('uncertain transport'));
      await executeGenerationJob(app, (await claimGenerationJob())!);
      expect(await claimGenerationJob()).toBeNull();
      expect(send).toHaveBeenCalledTimes(1);
      expect(
        await prisma.wodGenerationJob.findFirst({
          where: { wodId: wod.id },
          select: { status: true },
        }),
      ).toEqual({ status: 'FAILED' });
    });
    it('honors account revocation after admission', async () => {
      const wod = await createWod();
      await enqueue(wod.id);
      await prisma.user.update({ where: { id: owner }, data: { accessStatus: 'BLOCKED' } });
      try {
        await executeGenerationJob(app, (await claimGenerationJob())!);
        expect(send).not.toHaveBeenCalled();
      } finally {
        await prisma.user.update({ where: { id: owner }, data: { accessStatus: 'APPROVED' } });
      }
      expect(
        await prisma.wodGenerationJob.findFirst({
          where: { wodId: wod.id },
          select: { statusCode: true },
        }),
      ).toEqual({ statusCode: 403 });
    });
    it('combines only the account consumed fields with UTC instants equivalent to Prisma', async () => {
      const achievedAt = new Date('2026-10-20T12:34:56.789Z');
      await prisma.athleteProfile.create({
        data: {
          userId: owner,
          level: 'INTERMEDIATE',
          goals: ['performance'],
          injuries: [],
          limitedMovements: [],
          weeklyFrequency: 5,
        },
      });
      await prisma.dailyCheckin.create({
        data: { userId: owner, date: new Date(), notes: 'private' },
      });
      await prisma.personalRecord.create({
        data: {
          userId: owner,
          movementName: 'Back Squat',
          value: 100,
          unit: 'kg',
          recordType: 'ONE_RM',
          achievedAt,
        },
      });
      await prisma.personalRecord.create({
        data: { userId: other, movementName: 'Private Other', value: 999, unit: 'kg', achievedAt },
      });
      const result = await readAthleteStrategyBasics(owner);
      expect(result.profile).toEqual({
        level: 'INTERMEDIATE',
        goals: ['performance'],
        injuries: [],
        limitedMovements: [],
        weeklyFrequency: 5,
      });
      expect(result.checkins).toEqual(
        await prisma.dailyCheckin.findMany({
          where: { userId: owner },
          select: { date: true },
          orderBy: { date: 'desc' },
        }),
      );
      expect(result.personalRecords).toEqual(
        await prisma.personalRecord.findMany({
          where: { userId: owner },
          select: {
            movementName: true,
            value: true,
            unit: true,
            recordType: true,
            repetitions: true,
            achievedAt: true,
          },
        }),
      );
      expect(result.personalRecords[0].achievedAt).toEqual(achievedAt);
      expect(JSON.stringify(result)).not.toMatch(/private|Private Other/);
    });
  },
);
