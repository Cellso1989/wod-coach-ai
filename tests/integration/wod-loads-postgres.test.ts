import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../packages/database/dist/index.js';
import { buildApp } from '../../apps/api/src/app.js';
import { ladderAnalysis, ladderSource, ladderStrategy } from '../fixtures/wod-ladder-case.js';

const mocks = vi.hoisted(() => ({ sendMessage: vi.fn() }));
vi.mock('../../packages/ai/dist/index.js', async (original) => ({
  ...(await original<typeof import('@wod-coach-ai/ai')>()),
  createOpenAiMessageSender: () => mocks.sendMessage,
}));

describe.skipIf(!process.env.WOD_LOAD_TEST_DATABASE_URL)(
  'manual loads on disposable PostgreSQL',
  () => {
    let app: ReturnType<typeof buildApp>;
    let userId: string;
    let headers: { authorization: string };

    beforeAll(async () => {
      const database = new URL(process.env.WOD_LOAD_TEST_DATABASE_URL!);
      if (
        database.hostname !== '127.0.0.1' ||
        database.port !== '55432' ||
        database.pathname !== '/wodcoach_qa' ||
        process.env.DATABASE_URL !== database.href
      )
        throw new Error('Use the isolated load test database');
      const user = await prisma.user.create({
        data: {
          email: `load-test-${Date.now()}@example.com`,
          name: 'Load QA',
          passwordHash: 'test-only',
        },
      });
      userId = user.id;
      await prisma.athleteProfile.create({ data: { userId, level: 'INTERMEDIATE' } });
      const unsigned = [{ alg: 'HS256', typ: 'JWT' }, { sub: userId }]
        .map((item) => Buffer.from(JSON.stringify(item)).toString('base64url'))
        .join('.');
      headers = {
        authorization: `Bearer ${unsigned}.${createHmac('sha256', process.env.JWT_SECRET!).update(unsigned).digest('base64url')}`,
      };
      app = buildApp();
      await app.ready();
    });

    afterAll(async () => {
      if (app) await app.close();
      if (userId) await prisma.user.delete({ where: { id: userId } });
      await prisma.$disconnect();
    });

    it.each([false, true])(
      'persists load edits, versions, strategy inputs and reanalysis without extra AI calls (image: %s)',
      async (image) => {
        const source = image ? null : ladderSource;
        const wod = await prisma.wod.create({
          data: {
            userId,
            date: new Date(),
            sourceType: image ? 'IMAGE' : 'TEXT',
            rawText: source,
            imageData: image ? 'fixture-image' : null,
            imageMimeType: image ? 'image/png' : null,
          },
        });
        const invoke = (method: 'POST' | 'PATCH', suffix: string, payload?: object) =>
          app.inject({ method, url: `/api/wods/${wod.id}/${suffix}`, headers, payload });
        const output = {
          ...ladderAnalysis,
          durationMinutes: null,
          extractedText: image ? ladderSource : null,
        };
        mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(output) });
        expect((await invoke('POST', 'analyze')).statusCode).toBe(200);
        const original = await prisma.wodAnalysisVersion.findFirstOrThrow({
          where: { wodId: wod.id },
        });
        let analysis = await prisma.wodAnalysis.findUniqueOrThrow({
          where: { wodId: wod.id },
          include: { movements: { orderBy: { order: 'asc' } } },
        });
        await invoke('PATCH', 'analysis', { durationMinutes: 16 });
        mocks.sendMessage.mockClear();
        const saved = await invoke('PATCH', 'analysis', {
          movementLoads: [{ id: analysis.movements[0]!.id, loadDescription: '60/40 kg' }],
        });
        expect(saved.statusCode).toBe(200);
        expect(mocks.sendMessage).not.toHaveBeenCalled();
        analysis = saved.json().analysis;
        expect(analysis).toMatchObject({
          durationMinutes: 16,
          rawResponse: {
            durationOverrideMinutes: 16,
            loadOverrides: [{ loadDescription: '60/40 kg' }],
          },
          movements: [{ loadDescription: '60/40 kg' }, {}, {}],
        });
        expect(analysis.warnings.join(' ')).not.toContain('Carga nao informada');
        expect(
          await prisma.wodAnalysisVersion.findUniqueOrThrow({ where: { id: original.id } }),
        ).toEqual(original);
        expect(
          (
            await invoke('PATCH', 'analysis', {
              movementLoads: [{ id: 'foreign-id', loadDescription: '20 kg' }],
            })
          ).statusCode,
        ).toBe(409);
        expect(
          (await prisma.wodAnalysis.findUniqueOrThrow({ where: { wodId: wod.id } })).versionId,
        ).toBe(analysis.versionId);
        for (let attempt = 0; attempt < 2; attempt++) {
          expect((await invoke('POST', 'analyze')).statusCode).toBe(200);
          analysis = await prisma.wodAnalysis.findUniqueOrThrow({
            where: { wodId: wod.id },
            include: { movements: { orderBy: { order: 'asc' } } },
          });
          expect(analysis.movements[0]!.loadDescription).toBe('60/40 kg');
          expect(analysis.roundBreakdown).toEqual(
            ladderAnalysis.rounds!.map((round) => ({
              ...round,
              movements: round.movements.map((movement) =>
                movement.category === 'weightlifting'
                  ? { ...movement, loadDescription: '60/40 kg' }
                  : movement,
              ),
            })),
          );
        }
        mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(ladderStrategy) });
        const strategy = await invoke('POST', 'strategy');
        expect(strategy.statusCode, strategy.body).toBe(200);
        expect(
          await prisma.wodStrategyVersion.findFirstOrThrow({ where: { wodId: wod.id } }),
        ).toMatchObject({
          inputSnapshot: {
            wodAnalysis: {
              durationMinutes: 16,
              movements: [{ loadDescription: '60/40 kg' }, {}, {}],
              rounds: analysis.roundBreakdown,
            },
          },
        });
        expect(
          (
            await invoke('PATCH', 'analysis', {
              versionId: original.id,
              movementLoads: [{ id: analysis.movements[0]!.id, loadDescription: '20 kg' }],
            })
          ).statusCode,
        ).toBe(409);
        expect(await prisma.wodStrategy.findUnique({ where: { wodId: wod.id } })).not.toBeNull();
        expect(
          (
            await invoke('PATCH', 'analysis', {
              movementLoads: [{ id: analysis.movements[0]!.id, loadDescription: null }],
            })
          ).statusCode,
        ).toBe(200);
        expect(await prisma.wodStrategy.findUnique({ where: { wodId: wod.id } })).toBeNull();
        expect(await prisma.wodStrategyVersion.count({ where: { wodId: wod.id } })).toBe(1);
        mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(output) });
        const cleared = await invoke('POST', 'analyze');
        expect(cleared.statusCode).toBe(200);
        expect(cleared.json().analysis.movements[0].loadDescription).toBeNull();
        expect(cleared.json().analysis.warnings.join(' ')).toContain('Carga nao informada');
      },
      30_000,
    );
  },
);
