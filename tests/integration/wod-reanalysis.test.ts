import { createHash, createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../apps/api/src/app.js';
import { Prisma } from '../../packages/database/dist/index.js';
import { simpleSourceCase, wodFormatCases } from '../fixtures/wod-format-cases.js';

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  context: vi.fn(),
  prisma: {
    wod: { findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
    wodAnalysis: { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    wodStrategy: { deleteMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    wodAnalysisVersion: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    wodStrategyVersion: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    athleteProfile: { findUnique: vi.fn() },
    $transaction: vi.fn(),
    $disconnect: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

vi.mock('../../packages/database/dist/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@wod-coach-ai/database')>()),
  prisma: mocks.prisma,
}));
vi.mock('../../packages/ai/dist/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@wod-coach-ai/ai')>()),
  createOpenAiMessageSender: () => mocks.sendMessage,
}));
vi.mock('../../apps/api/src/services/athlete-context-service.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../apps/api/src/services/athlete-context-service.js')
  >()),
  getAthleteContextForWod: mocks.context,
}));

const RAW_WOD =
  'Buy-in: 25 thrusters 40kg\n3 rounds: 10 T2B, 200m run\nBuy-out: 25 thrusters 40kg\nTime cap: 20 min';
const ANALYSIS = {
  format: 'ROUNDS_FOR_TIME',
  durationMinutes: 20,
  stimulus: 'mixed_modal',
  movements: [
    { name: 'Thruster', category: 'weightlifting', reps: 50, loadDescription: '40kg' },
    { name: 'Toes to Bar', category: 'gymnastics', reps: 30 },
    { name: 'Run', category: 'monostructural', distanceMeters: 600 },
  ],
  rounds: [
    {
      roundNumber: 1,
      label: 'Buy-in',
      movements: [
        { name: 'Thruster', category: 'weightlifting', reps: 25, loadDescription: '40kg' },
      ],
    },
    ...Array.from({ length: 3 }, (_, index) => ({
      roundNumber: index + 2,
      label: `Round ${index + 1}`,
      movements: [
        { name: 'Toes to Bar', category: 'gymnastics', reps: 10 },
        { name: 'Run', category: 'monostructural', distanceMeters: 200 },
      ],
    })),
    {
      roundNumber: 5,
      label: 'Buy-out',
      movements: [
        { name: 'Thruster', category: 'weightlifting', reps: 25, loadDescription: '40kg' },
      ],
    },
  ],
  estimatedDemand: { engine: 8, grip: 7, legs: 7, gymnastics: 6, technical: 5 },
  estimatedIntensity: 8,
  confidence: 0.9,
  warnings: [],
};
const STRATEGY = {
  recommendedIntensity: 9,
  targetRpe: 10,
  loadRecommendation: null,
  pacing: 'Controle o buy-in; acelere no buy-out.',
  breakStrategy: [{ movement: 'Toes to Bar (10 por round)', strategy: '6/4.' }],
  restStrategy: 'Pausas de 5 segundos.',
  movementStrategy: [{ movement: 'Run', strategy: 'Ritmo constante.' }],
  transitionStrategy: 'Transicoes curtas.',
  energyManagement: 'Preserve o grip.',
  goal: 'Terminar dentro do cap.',
  target: '16-19 min',
  criticalPoint: 'Grip',
  confidence: 0.85,
  warnings: [],
};
const PROFILE = {
  level: 'INTERMEDIATE',
  goals: ['performance'],
  injuries: [],
  limitedMovements: [],
  weeklyFrequency: 5,
};
const CONTEXT = {
  trainingLoad: {
    last7Days: { days: 7, sessionCount: 2 },
    last14Days: { days: 14, sessionCount: 4 },
    last28Days: { days: 28, sessionCount: 8 },
  },
  similarWods: [],
  relevantPersonalRecords: [
    { movementName: 'Toes to Bar', value: 22, unit: 'reps', achievedAt: '2026-09-01' },
  ],
  dataSufficiency: 'moderate',
};

type Row = Record<string, unknown>;
type Store = {
  wod: {
    id: string;
    userId: string;
    rawText: string | null;
    imageData: string | null;
    imageMimeType: string | null;
    sourceType: string;
    result: { score: string };
  };
  analysis: Row | null;
  strategy: Row | null;
  analysisVersions: Row[];
  strategyVersions: Row[];
};
let store: Store;
let failWrite: 'analysis' | 'strategy' | 'wod' | 'analysisVersion' | 'strategyVersion' | null;
let app: ReturnType<typeof buildApp>;
let headers: { authorization: string };
let lease: { token: string; expiresAt: number } | null;

async function leaseQuery(strings: TemplateStringsArray, ...values: unknown[]) {
  const sql = strings.join('?');
  if (!sql.includes('wod_generation_leases')) return [];
  if (sql.includes('INSERT')) {
    if (lease && lease.expiresAt > Date.now()) return [];
    lease = { token: values[0] as string, expiresAt: Date.now() + 600_000 };
    return [{ token: lease.token }];
  }
  if (!lease || lease.token !== values[1]) return [];
  if (sql.includes('DELETE')) {
    lease = null;
    return [];
  }
  return lease.expiresAt > Date.now() ? [{ token: lease.token }] : [];
}

// Transaction writes use a draft; failed writes never publish partial state.
function databaseClient(current: () => Store) {
  function versions(key: 'analysisVersions' | 'strategyVersions') {
    return {
      findFirst: async () => current()[key].at(-1) ?? null,
      findMany: async () => [...current()[key]].reverse(),
      create: async ({ data }: { data: Row }) => {
        if (failWrite === (key === 'analysisVersions' ? 'analysisVersion' : 'strategyVersion')) {
          throw new Error('Version write failed');
        }
        const row = structuredClone({ ...data, id: `${key}-${current()[key].length + 1}` });
        current()[key].push(row);
        return row;
      },
    };
  }
  return {
    $queryRaw: leaseQuery,
    wod: {
      findFirst: async () => structuredClone(current().wod),
      findUniqueOrThrow: async () => ({ ...current().wod, analysis: current().analysis }),
      update: async ({ data }: { data: Row }) => {
        if (failWrite === 'wod') throw new Error('WOD write failed');
        Object.assign(
          current().wod,
          Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)),
        );
        return current().wod;
      },
    },
    wodAnalysis: {
      upsert: async ({ create, update }: { create: Row; update: Row }) => {
        if (failWrite === 'analysis') throw new Error('Analysis write failed');
        const data = current().analysis ? update : create;
        const movements = (data.movements as { create: Row[] }).create;
        current().analysis = {
          ...current().analysis,
          ...data,
          roundBreakdown: data.roundBreakdown === Prisma.JsonNull ? null : data.roundBreakdown,
          id: 'analysis-1',
          wodId: current().wod.id,
          movements: movements.map((movement, index) => ({
            ...movement,
            reps: movement.reps ?? null,
            distanceMeters: movement.distanceMeters ?? null,
            calories: movement.calories ?? null,
            loadDescription: movement.loadDescription ?? null,
            id: `movement-${index}`,
          })),
        };
        return current().analysis;
      },
      findUnique: async () => current().analysis,
      update: async ({ data }: { data: Row }) => {
        Object.assign(current().analysis!, data);
        return current().analysis;
      },
      deleteMany: async () => {
        current().analysis = null;
        return { count: 1 };
      },
    },
    wodStrategy: {
      deleteMany: async ({ where }: { where: { wodId: string } }) => {
        if (failWrite === 'strategy') throw new Error('Strategy invalidation failed');
        expect(where).toEqual({ wodId: current().wod.id });
        const count = current().strategy ? 1 : 0;
        current().strategy = null;
        return { count };
      },
      findUnique: async () => current().strategy,
      upsert: async ({ create, update }: { create: Row; update: Row }) => {
        current().strategy = { ...(current().strategy ? update : create), id: 'strategy-1' };
        return current().strategy;
      },
      update: async ({ data }: { data: Row }) => {
        Object.assign(current().strategy!, data);
        return current().strategy;
      },
    },
    wodAnalysisVersion: versions('analysisVersions'),
    wodStrategyVersion: versions('strategyVersions'),
  };
}

beforeEach(async () => {
  vi.resetAllMocks();
  lease = null;
  mocks.prisma.$queryRaw.mockImplementation(leaseQuery);
  failWrite = null;
  store = {
    wod: {
      id: 'wod-1',
      userId: 'athlete-1',
      rawText: RAW_WOD,
      imageData: null,
      imageMimeType: null,
      sourceType: 'TEXT',
      result: { score: '18:30' },
    },
    analysis: null,
    strategy: null,
    analysisVersions: [],
    strategyVersions: [],
  };
  const client = databaseClient(() => store);
  for (const model of [
    'wod',
    'wodAnalysis',
    'wodStrategy',
    'wodAnalysisVersion',
    'wodStrategyVersion',
  ] as const) {
    for (const [name, implementation] of Object.entries(client[model])) {
      const method = mocks.prisma[model][name as keyof (typeof mocks.prisma)[typeof model]];
      method.mockImplementation(implementation);
    }
  }
  mocks.prisma.$transaction.mockImplementation(
    async (work: (tx: ReturnType<typeof databaseClient>) => Promise<unknown>) => {
      const draft = structuredClone(store);
      const result = await work(databaseClient(() => draft));
      store = draft;
      return result;
    },
  );
  mocks.prisma.athleteProfile.findUnique.mockResolvedValue(PROFILE);
  mocks.context.mockImplementation(async () => ({
    context: CONTEXT,
    targetWod: structuredClone({ ...store.wod, analysis: store.analysis }),
  }));
  mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(ANALYSIS) });
  app = buildApp();
  await app.ready();
  const tokenHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
    'base64url',
  );
  const tokenPayload = Buffer.from(JSON.stringify({ sub: 'athlete-1' })).toString('base64url');
  const unsignedToken = `${tokenHeader}.${tokenPayload}`;
  const signature = createHmac('sha256', process.env.JWT_SECRET!)
    .update(unsignedToken)
    .digest('base64url');
  headers = { authorization: `Bearer ${unsignedToken}.${signature}` };
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await app.close();
});

async function request(method: 'POST' | 'GET' | 'PATCH', suffix: string, payload?: Row) {
  return app.inject({ method, url: `/api/wods/wod-1/${suffix}`, headers, payload });
}

async function seedAnalyzedWod() {
  expect((await request('POST', 'analyze')).statusCode).toBe(200);
  mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(STRATEGY) });
  expect((await request('POST', 'strategy')).statusCode).toBe(200);
  mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(ANALYSIS) });
}

describe('WOD analysis and reanalysis API regression (database and AI transport mocked)', () => {
  for (const reanalysis of [false, true]) {
    it.each([false, true])(
      `preserves saved data after unsupported load guidance (reanalysis: ${reanalysis}, active strategy: %s)`,
      async (activeStrategy) => {
        if (reanalysis) await seedAnalyzedWod();
        expect((await request('POST', 'analyze')).statusCode).toBe(200);
        if (activeStrategy) {
          mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(STRATEGY) });
          expect((await request('POST', 'strategy')).statusCode).toBe(200);
        }
        const before = structuredClone(store);
        const calls = mocks.sendMessage.mock.calls.length;
        mocks.sendMessage.mockResolvedValue({
          text: JSON.stringify({ ...STRATEGY, loadRecommendation: '60kg' }),
        });
        expect((await request('POST', 'strategy')).statusCode).toBe(502);
        expect(mocks.sendMessage.mock.calls.length - calls).toBe(2);
        expect(store).toEqual(before);
        expect((await request('GET', 'analysis')).statusCode).toBe(200);
        expect((await request('GET', 'strategy')).statusCode).toBe(activeStrategy ? 200 : 404);
      },
    );

    it(`persists only corrected load guidance (reanalysis: ${reanalysis})`, async () => {
      if (reanalysis) await seedAnalyzedWod();
      expect((await request('POST', 'analyze')).statusCode).toBe(200);
      const previousVersions = structuredClone(store.strategyVersions);
      mocks.sendMessage
        .mockResolvedValueOnce({
          text: JSON.stringify({ ...STRATEGY, loadRecommendation: '60kg' }),
        })
        .mockResolvedValueOnce({ text: JSON.stringify(STRATEGY) });
      expect((await request('POST', 'strategy')).statusCode).toBe(200);
      expect(store.strategy?.loadRecommendation).toBeNull();
      expect(store.strategyVersions.slice(0, previousVersions.length)).toEqual(previousVersions);
      expect(store.strategyVersions).toHaveLength(previousVersions.length + 1);
      expect(store.strategyVersions.at(-1)).toMatchObject({
        inputSnapshot: { athleteContext: CONTEXT, athleteProfile: PROFILE, wodAnalysis: ANALYSIS },
      });
    });
  }

  it('retains a supported load and its exact athlete record in the strategy snapshot', async () => {
    expect((await request('POST', 'analyze')).statusCode).toBe(200);
    const context = {
      ...CONTEXT,
      relevantPersonalRecords: [
        {
          movementName: 'Thruster',
          value: 100,
          unit: 'kg',
          achievedAt: '2026-09-01',
        },
      ],
    };
    mocks.context.mockImplementation(async () => ({
      context,
      targetWod: structuredClone({ ...store.wod, analysis: store.analysis }),
    }));
    mocks.sendMessage.mockResolvedValue({
      text: JSON.stringify({ ...STRATEGY, loadRecommendation: '60kg (PR Thruster 100kg)' }),
    });
    expect((await request('POST', 'strategy')).statusCode).toBe(200);
    expect(store.strategy?.loadRecommendation).toBe('60kg (PR Thruster 100kg)');
    expect(store.strategyVersions.at(-1)).toMatchObject({
      inputSnapshot: { athleteContext: context },
    });
  });

  for (const reanalysis of [false, true]) {
    it.each(wodFormatCases)(
      `preserves format/source/structure/context: $name (reanalysis: ${reanalysis})`,
      async ({ rawText, analysis }) => {
        store.wod.rawText = rawText;
        mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(analysis) });
        if (reanalysis) {
          expect((await request('POST', 'analyze')).statusCode).toBe(200);
          mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(STRATEGY) });
          expect((await request('POST', 'strategy')).statusCode).toBe(200);
        }
        const previous = structuredClone(store.analysisVersions);
        const originalWod = structuredClone(store.wod);
        mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(analysis) });
        expect((await request('POST', 'analyze')).statusCode).toBe(200);
        expect(mocks.sendMessage.mock.calls.at(-1)?.[0].messages[0].content[0]).toMatchObject({
          type: 'text',
          text: `Treino recebido (texto):\n\n${rawText}`,
        });
        expect(store.wod).toEqual(originalWod);
        expect(store.analysis).toMatchObject({
          format: analysis.format,
          durationMinutes: analysis.durationMinutes,
          roundBreakdown: analysis.rounds,
          rawResponse: analysis,
          movements: analysis.movements.map((movement) =>
            expect.objectContaining({
              ...movement,
            }),
          ),
        });
        expect(store.analysisVersions.slice(0, previous.length)).toEqual(previous);
        expect(store.analysisVersions).toHaveLength(reanalysis ? 2 : 1);
        expect(store.strategy).toBeNull();
        mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(STRATEGY) });
        expect((await request('POST', 'strategy')).statusCode).toBe(200);
        expect(store.strategyVersions.at(-1)).toMatchObject({
          inputSnapshot: {
            wodAnalysis: analysis,
            athleteContext: CONTEXT,
            athleteProfile: PROFILE,
          },
        });
      },
    );

    it.each([
      {
        movements: ANALYSIS.movements.map((movement) => ({
          ...movement,
          reps: movement.reps == null ? undefined : movement.reps * 10,
        })),
      },
      { movements: ANALYSIS.movements.slice(1) },
      {
        rounds: ANALYSIS.rounds.map((round) => ({
          ...round,
          movements: round.movements.map((movement) =>
            movement.name === 'Thruster' ? { ...movement, loadDescription: '80kg' } : movement,
          ),
        })),
      },
    ])(
      `preserves all saved data after inconsistent analysis (reanalysis: ${reanalysis}): %j`,
      async (change) => {
        if (reanalysis) await seedAnalyzedWod();
        const before = structuredClone(store);
        const calls = mocks.sendMessage.mock.calls.length;
        mocks.sendMessage.mockResolvedValue({ text: JSON.stringify({ ...ANALYSIS, ...change }) });
        expect((await request('POST', 'analyze')).statusCode).toBe(502);
        expect(mocks.sendMessage.mock.calls.length - calls).toBe(2);
        expect(store).toEqual(before);
      },
    );
  }

  it('preserves every historical snapshot across three successive reanalyses', async () => {
    await seedAnalyzedWod();
    const wod = structuredClone(store.wod);
    for (const durationMinutes of [18, 19, 20]) {
      const analyses = structuredClone(store.analysisVersions);
      const strategies = structuredClone(store.strategyVersions);
      mocks.sendMessage.mockResolvedValue({
        text: JSON.stringify({ ...ANALYSIS, durationMinutes }),
      });
      expect((await request('POST', 'analyze')).statusCode).toBe(200);
      expect(store.analysisVersions.slice(0, analyses.length)).toEqual(analyses);
      expect(store.strategyVersions).toEqual(strategies);
      expect(store.strategy).toBeNull();
      mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(STRATEGY) });
      expect((await request('POST', 'strategy')).statusCode).toBe(200);
      expect(store.strategyVersions.slice(0, strategies.length)).toEqual(strategies);
      expect(store.wod).toEqual(wod);
    }
    expect(store.analysisVersions).toHaveLength(4);
    expect(store.strategyVersions).toHaveLength(4);
  });

  for (const reanalysis of [false, true]) {
    it.each(['omission', 'volume'])(
      `preserves data after source mismatch: %s (reanalysis: ${reanalysis})`,
      async (fault) => {
        if (reanalysis) await seedAnalyzedWod();
        store.wod.rawText = simpleSourceCase.rawText;
        const before = structuredClone(store);
        const analysis = structuredClone(simpleSourceCase.analysis);
        if (fault === 'omission') analysis.movements.shift();
        else analysis.movements[0]!.reps = 100;
        mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(analysis) });
        const calls = mocks.sendMessage.mock.calls.length;
        expect((await request('POST', 'analyze')).statusCode).toBe(502);
        expect(mocks.sendMessage.mock.calls.length - calls).toBe(2);
        expect(store).toEqual(before);
        expect(lease).toBeNull();
      },
    );
  }

  for (const reanalysis of [false, true]) {
    it.each(['analyze', 'strategy'] as const)(
      `rejects overlapping %s without a second AI call (reanalysis: ${reanalysis})`,
      async (operation) => {
        if (reanalysis) await seedAnalyzedWod();
        if (operation === 'strategy' && !store.analysis) await request('POST', 'analyze');
        const output = operation === 'analyze' ? ANALYSIS : STRATEGY;
        mocks.sendMessage.mockClear();
        let started!: () => void;
        let release!: () => void;
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
        const first = request('POST', operation);
        try {
          await observed;
          const second = await request('POST', operation);
          expect(second.statusCode).toBe(409);
          expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
        } finally {
          release();
          expect((await first).statusCode).toBe(200);
        }
      },
    );
  }

  it.each(['analyze', 'strategy'] as const)(
    'releases admission after %s failure so an explicit retry can succeed',
    async (operation) => {
      if (operation === 'strategy') await seedAnalyzedWod();
      const previous = structuredClone(store);
      mocks.sendMessage.mockRejectedValueOnce(new Error('Provider failed'));
      expect((await request('POST', operation)).statusCode).toBe(500);
      expect(lease).toBeNull();
      expect(store).toEqual(previous);
      mocks.sendMessage.mockResolvedValue({
        text: JSON.stringify(operation === 'analyze' ? ANALYSIS : STRATEGY),
      });
      expect((await request('POST', operation)).statusCode).toBe(200);
      expect(lease).toBeNull();
    },
  );

  it.each(['analyze', 'strategy'] as const)(
    'does not spend a corrective %s attempt after its reservation expires',
    async (operation) => {
      if (operation === 'strategy') await seedAnalyzedWod();
      const previous = structuredClone(store);
      mocks.sendMessage.mockClear();
      mocks.sendMessage.mockImplementationOnce(async () => {
        lease!.expiresAt = 0;
        return { text: 'invalid json' };
      });
      expect((await request('POST', operation)).statusCode).toBe(409);
      expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
      expect(store).toEqual(previous);
      expect(lease).toBeNull();
    },
  );

  it.each(['analyze', 'strategy'] as const)(
    'shares admission between analysis and strategy while %s runs',
    async (operation) => {
      await seedAnalyzedWod();
      const other = operation === 'analyze' ? 'strategy' : 'analyze';
      mocks.sendMessage.mockClear();
      let started!: () => void;
      let release!: () => void;
      const observed = new Promise<void>((resolve) => {
        started = resolve;
      });
      const paused = new Promise<void>((resolve) => {
        release = resolve;
      });
      mocks.sendMessage.mockImplementationOnce(async () => {
        started();
        await paused;
        return { text: JSON.stringify(operation === 'analyze' ? ANALYSIS : STRATEGY) };
      });
      mocks.sendMessage.mockResolvedValue({
        text: JSON.stringify(other === 'analyze' ? ANALYSIS : STRATEGY),
      });
      const first = request('POST', operation);
      try {
        await observed;
        const second = await request('POST', other);
        expect(second.statusCode).toBe(409);
        expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
      } finally {
        release();
        expect((await first).statusCode).toBe(200);
      }
    },
  );

  for (const reanalysis of [false, true]) {
    it.each(['analyze', 'strategy'] as const)(
      `archives generation metadata including the corrective retry during %s (reanalysis: ${reanalysis})`,
      async (operation) => {
        if (reanalysis) await seedAnalyzedWod();
        if (operation === 'strategy')
          expect((await request('POST', 'analyze')).statusCode).toBe(200);
        const versions = operation === 'analyze' ? store.analysisVersions : store.strategyVersions;
        const previous = structuredClone(versions);
        mocks.sendMessage
          .mockResolvedValueOnce({
            text: 'invalid json',
            metadata: {
              responseId: 'resp-first',
              model: 'gpt-5-mini-snapshot',
              usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
            },
          })
          .mockResolvedValueOnce({
            text: JSON.stringify(operation === 'analyze' ? ANALYSIS : STRATEGY),
            metadata: {
              responseId: 'resp-retry',
              model: 'gpt-5-mini-snapshot',
              usage: { inputTokens: 150, outputTokens: 30, totalTokens: 180 },
            },
          });
        const calls = mocks.sendMessage.mock.calls.length;
        expect((await request('POST', operation)).statusCode).toBe(200);
        const saved = (
          operation === 'analyze' ? store.analysisVersions : store.strategyVersions
        ).at(-1)!;
        const prompt = mocks.sendMessage.mock.calls[calls][0].systemPrompt;
        expect(saved).toMatchObject({
          snapshot: {
            generationMetadata: {
              schemaVersion: 1,
              provider: 'openai',
              agent: operation === 'analyze' ? 'WodAnalyzerAgent' : 'StrategyCoachAgent',
              attempts: [
                {
                  attempt: 1,
                  requestedModel: 'gpt-5-mini',
                  model: 'gpt-5-mini-snapshot',
                  responseId: 'resp-first',
                  promptVersion: `sha256:${createHash('sha256').update(prompt).digest('hex')}`,
                  usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
                },
                {
                  attempt: 2,
                  responseId: 'resp-retry',
                  usage: { inputTokens: 150, outputTokens: 30, totalTokens: 180 },
                },
              ],
              totalUsage: { inputTokens: 250, outputTokens: 50, totalTokens: 300 },
            },
          },
        });
        expect(
          (operation === 'analyze' ? store.analysisVersions : store.strategyVersions).slice(0, -1),
        ).toEqual(previous);
        const response = (await request('GET', 'versions')).json();
        expect(
          (operation === 'analyze' ? response.analysisVersions : response.strategyVersions)[0]
            .snapshot.generationMetadata,
        ).toEqual((saved.snapshot as Row).generationMetadata);
      },
    );
  }

  for (const reanalysis of [false, true]) {
    for (const operation of ['analyze', 'strategy'] as const) {
      it.each(['incomplete', 'timeout'] as const)(
        `preserves all data on HTTP %s during ${operation} (reanalysis: ${reanalysis})`,
        async (failure) => {
          if (reanalysis) await seedAnalyzedWod();
          if (operation === 'strategy') {
            expect((await request('POST', 'analyze')).statusCode).toBe(200);
          }
          const previous = structuredClone(store);
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
          const pending = request('POST', operation);
          await observed;
          if (failure === 'timeout') await vi.advanceTimersByTimeAsync(120_000);
          const response = await pending;
          expect(response.statusCode).toBe(failure === 'timeout' ? 504 : 502);
          expect(response.json().error).toContain(
            failure === 'timeout' ? 'demorou' : 'nao concluiu',
          );
          expect(fetchMock).toHaveBeenCalledTimes(1);
          expect(store).toEqual(previous);
        },
      );
    }
    it(`saves completed HTTP analysis and strategy (reanalysis: ${reanalysis})`, async () => {
      if (reanalysis) await seedAnalyzedWod();
      const transport = await vi.importActual<typeof import('@wod-coach-ai/ai')>(
        '../../packages/ai/dist/index.js',
      );
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ status: 'completed', output_text: JSON.stringify(ANALYSIS) }),
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ status: 'completed', output_text: JSON.stringify(STRATEGY) }),
          ),
        );
      vi.stubGlobal('fetch', fetchMock);
      mocks.sendMessage.mockImplementation(transport.createOpenAiMessageSender('test-key'));
      expect((await request('POST', 'analyze')).statusCode).toBe(200);
      expect((await request('POST', 'strategy')).statusCode).toBe(200);
      expect(store.analysis?.roundBreakdown).toEqual(ANALYSIS.rounds);
      expect(store.analysisVersions).toHaveLength(reanalysis ? 2 : 1);
      expect(store.strategyVersions).toHaveLength(reanalysis ? 2 : 1);
      expect(store.strategyVersions.at(-1)).toMatchObject({
        inputSnapshot: { wodAnalysis: ANALYSIS, athleteContext: CONTEXT, athleteProfile: PROFILE },
      });
    });
  }

  for (const reanalysis of [false, true]) {
    it.each([null, ANALYSIS.rounds.slice(0, 3)])(
      `preserves the WOD and versions when explicit rounds are missing (reanalysis: ${reanalysis}): %j`,
      async (rounds) => {
        if (reanalysis) await seedAnalyzedWod();
        const previous = structuredClone(store);
        const calls = mocks.sendMessage.mock.calls.length;
        mocks.sendMessage.mockResolvedValue({ text: JSON.stringify({ ...ANALYSIS, rounds }) });
        expect((await request('POST', 'analyze')).statusCode).toBe(502);
        expect(mocks.sendMessage.mock.calls.length - calls).toBe(2);
        expect(store).toEqual(previous);
      },
    );
  }

  it('saves corrected rounds and forwards all blocks, reps and loads to the strategy agent', async () => {
    mocks.sendMessage
      .mockResolvedValueOnce({ text: JSON.stringify({ ...ANALYSIS, rounds: null }) })
      .mockResolvedValueOnce({ text: JSON.stringify(ANALYSIS) });
    expect((await request('POST', 'analyze')).statusCode).toBe(200);
    expect(store.analysisVersions).toHaveLength(1);
    expect(store.analysis?.roundBreakdown).toEqual(ANALYSIS.rounds);
    mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(STRATEGY) });
    expect((await request('POST', 'strategy')).statusCode).toBe(200);
    expect(store.strategyVersions[0]).toMatchObject({
      inputSnapshot: { wodAnalysis: { rounds: ANALYSIS.rounds } },
    });
  });

  for (const reanalysis of [false, true]) {
    it.each([{ movements: [] }, { rounds: [{ roundNumber: 1, label: 'Round 1', movements: [] }] }])(
      `rejects empty analysis after ${reanalysis ? 'saved analysis' : 'initial submission'}: %j`,
      async (empty) => {
        if (reanalysis) await seedAnalyzedWod();
        const previous = structuredClone(store);
        const calls = mocks.sendMessage.mock.calls.length;
        mocks.sendMessage.mockResolvedValue({ text: JSON.stringify({ ...ANALYSIS, ...empty }) });
        expect((await request('POST', 'analyze')).statusCode).toBe(502);
        expect(mocks.sendMessage.mock.calls.length - calls).toBe(2);
        expect(store).toEqual(previous);
        expect((await request('GET', 'analysis')).statusCode).toBe(reanalysis ? 200 : 404);
        expect((await request('GET', 'strategy')).statusCode).toBe(reanalysis ? 200 : 404);
      },
    );
  }

  it('persists only the complete analysis returned by the corrective retry', async () => {
    await seedAnalyzedWod();
    const original = structuredClone(store.analysisVersions[0]);
    mocks.sendMessage
      .mockResolvedValueOnce({ text: JSON.stringify({ ...ANALYSIS, movements: [] }) })
      .mockResolvedValueOnce({ text: JSON.stringify(ANALYSIS) });
    expect((await request('POST', 'analyze')).statusCode).toBe(200);
    expect(store.analysisVersions).toHaveLength(2);
    expect(store.analysisVersions[0]).toEqual(original);
    expect(store.analysis).toMatchObject({ roundBreakdown: ANALYSIS.rounds });
    expect(store.analysis).toMatchObject({
      movements: ANALYSIS.movements.map((movement) => expect.objectContaining(movement)),
    });
    expect(store.strategy).toBeNull();
  });

  it.each([true, false])(
    'uses the locked WOD text for invalidation (delayed edit changes current text: %s)',
    async (changesCurrentText) => {
      await seedAnalyzedWod();
      let release: () => void = () => {};
      let started: () => void = () => {};
      const observed = new Promise<void>((resolve) => {
        started = resolve;
      });
      const paused = new Promise<void>((resolve) => {
        release = resolve;
      });
      const original = structuredClone(store.wod);
      mocks.prisma.wod.findFirst.mockImplementationOnce(async () => {
        started();
        await paused;
        return original;
      });
      const newText = RAW_WOD.replace('20 min', '18 min');
      const pending = app.inject({
        method: 'PUT',
        url: '/api/wods/wod-1',
        headers,
        payload: { rawText: changesCurrentText ? RAW_WOD : newText },
      });
      await observed;
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/api/wods/wod-1',
            headers,
            payload: { rawText: newText },
          })
        ).statusCode,
      ).toBe(200);
      mocks.sendMessage.mockResolvedValue({
        text: JSON.stringify({ ...ANALYSIS, durationMinutes: 18 }),
      });
      expect((await request('POST', 'analyze')).statusCode).toBe(200);
      mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(STRATEGY) });
      expect((await request('POST', 'strategy')).statusCode).toBe(200);
      const fresh = structuredClone(store);
      release();
      expect((await pending).statusCode).toBe(200);
      expect(store.wod.rawText).toBe(changesCurrentText ? RAW_WOD : newText);
      expect(store.analysis).toEqual(changesCurrentText ? null : fresh.analysis);
      expect(store.strategy).toEqual(changesCurrentText ? null : fresh.strategy);
      expect(store.analysisVersions).toEqual(fresh.analysisVersions);
      expect(store.strategyVersions).toEqual(fresh.strategyVersions);
      expect(store.wod.result).toEqual(fresh.wod.result);
    },
  );

  it('preserves active analysis and strategy when only metadata is edited', async () => {
    await seedAnalyzedWod();
    const previous = structuredClone(store);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/wods/wod-1',
          headers,
          payload: { name: 'Updated name', notes: 'Updated notes' },
        })
      ).statusCode,
    ).toBe(200);
    expect(store.analysis).toEqual(previous.analysis);
    expect(store.strategy).toEqual(previous.strategy);
    expect(store.analysisVersions).toEqual(previous.analysisVersions);
    expect(store.strategyVersions).toEqual(previous.strategyVersions);
    expect(store.wod.rawText).toBe(previous.wod.rawText);
  });

  it.each(['strategy', 'wod'] as const)(
    'rolls back text edit invalidation when %s write fails',
    async (failure) => {
      await seedAnalyzedWod();
      const previous = structuredClone(store);
      failWrite = failure;
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/api/wods/wod-1',
            headers,
            payload: { rawText: 'AMRAP 10: 5 Burpees' },
          })
        ).statusCode,
      ).toBe(500);
      expect(store).toEqual(previous);
    },
  );

  it.each(['initial', 'reanalysis', 'image'] as const)(
    'rejects stale %s analysis after a text edit without changing the edited state',
    async (scenario) => {
      if (scenario === 'reanalysis') await seedAnalyzedWod();
      if (scenario === 'image') {
        store.wod.rawText = null;
        store.wod.imageData = 'image-base64';
        store.wod.imageMimeType = 'image/png';
        store.wod.sourceType = 'IMAGE';
      }
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
      const pending = request('POST', 'analyze');
      await observed;
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/api/wods/wod-1',
            headers,
            payload: { rawText: 'AMRAP 10\n5 Burpees' },
          })
        ).statusCode,
      ).toBe(200);
      const edited = structuredClone(store);
      release({ text: JSON.stringify({ ...ANALYSIS, extractedText: RAW_WOD }) });
      const response = await pending;
      expect(response.statusCode).toBe(409);
      expect(store).toEqual(edited);
      expect(store.analysis).toBeNull();
      expect(store.strategy).toBeNull();
      expect(store.wod.rawText).toBe('AMRAP 10\n5 Burpees');
    },
  );

  it('preserves versions when the WOD text is edited and active projections are removed', async () => {
    await seedAnalyzedWod();
    const versions = structuredClone({
      analyses: store.analysisVersions,
      strategies: store.strategyVersions,
    });
    const response = await app.inject({
      method: 'PUT',
      url: '/api/wods/wod-1',
      headers,
      payload: { rawText: 'AMRAP 10\n5 Burpees' },
    });
    expect(response.statusCode).toBe(200);
    expect(store.analysis).toBeNull();
    expect(store.strategy).toBeNull();
    expect(store.analysisVersions).toEqual(versions.analyses);
    expect(store.strategyVersions).toEqual(versions.strategies);
  });

  it('does not replace a fresh analysis or invalidate its strategy when an older request completes', async () => {
    await seedAnalyzedWod();
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
    const pending = request('POST', 'analyze');
    await observed;
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/wods/wod-1',
          headers,
          payload: { rawText: RAW_WOD.replace('20 min', '18 min') },
        })
      ).statusCode,
    ).toBe(200);
    mocks.sendMessage.mockResolvedValue({
      text: JSON.stringify({ ...ANALYSIS, durationMinutes: 18 }),
    });
    lease!.expiresAt = 0;
    expect((await request('POST', 'analyze')).statusCode).toBe(200);
    mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(STRATEGY) });
    expect((await request('POST', 'strategy')).statusCode).toBe(200);
    const fresh = structuredClone(store);
    release({ text: JSON.stringify(ANALYSIS) });
    expect((await pending).statusCode).toBe(409);
    expect(store).toEqual(fresh);
    expect((await request('GET', 'analysis')).json().analysis.durationMinutes).toBe(18);
    expect((await request('GET', 'strategy')).json().strategy).toMatchObject(STRATEGY);
  });

  it('records a new analysis version for a duration edit without changing earlier snapshots', async () => {
    await seedAnalyzedWod();
    const previous = structuredClone(store.analysisVersions[0]);
    expect((await request('PATCH', 'analysis', { durationMinutes: 16 })).statusCode).toBe(200);
    expect(store.analysisVersions).toHaveLength(2);
    expect(store.analysisVersions[0]).toEqual(previous);
    expect(store.analysisVersions[1]).toMatchObject({
      reason: 'DURATION_EDIT',
      snapshot: { durationMinutes: 16 },
    });
    expect(store.strategy).toBeNull();
    expect(store.strategyVersions).toHaveLength(1);
  });

  it('does not activate a strategy if its analysis version changed during generation', async () => {
    await seedAnalyzedWod();
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
    const pending = request('POST', 'strategy');
    await observed;
    expect((await request('PATCH', 'analysis', { durationMinutes: 18 })).statusCode).toBe(200);
    release({ text: JSON.stringify(STRATEGY) });
    expect((await pending).statusCode).toBe(409);
    expect(store.strategy).toBeNull();
    expect(store.strategyVersions).toHaveLength(1);
  });

  it('rejects invalid version pagination and hides another athlete WOD', async () => {
    expect((await request('GET', 'versions?analysisBefore=invalid')).statusCode).toBe(400);
    mocks.prisma.wod.findFirst.mockResolvedValueOnce(null);
    expect((await request('GET', 'versions')).statusCode).toBe(404);
    expect(mocks.prisma.wod.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'wod-1', userId: 'athlete-1', discipline: 'CROSSFIT' },
      }),
    );
  });

  it('retains original analysis and strategy versions after reanalysis', async () => {
    await seedAnalyzedWod();
    const originalAnalysis = structuredClone(store.analysisVersions[0]);
    const originalStrategy = structuredClone(store.strategyVersions[0]);
    mocks.sendMessage.mockResolvedValue({
      text: JSON.stringify({ ...ANALYSIS, durationMinutes: 18 }),
    });
    expect((await request('POST', 'analyze')).statusCode).toBe(200);
    expect(store.analysisVersions).toHaveLength(2);
    expect(store.analysisVersions[0]).toEqual(originalAnalysis);
    expect(store.strategyVersions[0]).toEqual(originalStrategy);
    expect(store.strategy).toBeNull();
    expect(store.analysisVersions.map((version) => version.version)).toEqual([1, 2]);
    expect(store.analysisVersions[0]).toMatchObject({
      sourceSnapshot: { rawText: RAW_WOD },
      snapshot: { durationMinutes: 20, roundBreakdown: ANALYSIS.rounds },
    });
    expect(store.strategyVersions[0]).toMatchObject({
      analysisVersionId: originalAnalysis.id,
      inputSnapshot: { athleteContext: CONTEXT, athleteProfile: PROFILE, wodAnalysis: ANALYSIS },
    });
    const response = await request('GET', 'versions');
    expect(response.statusCode).toBe(200);
    expect(response.json().analysisVersions).toHaveLength(2);
    expect(response.json().strategyVersions).toHaveLength(1);
  });

  it('adds a strategy version on regeneration without modifying previous versions', async () => {
    await seedAnalyzedWod();
    const original = structuredClone(store.strategyVersions[0]);
    mocks.sendMessage.mockResolvedValue({
      text: JSON.stringify({ ...STRATEGY, target: '15-18 min' }),
    });
    expect((await request('POST', 'strategy')).statusCode).toBe(200);
    expect(store.strategyVersions).toHaveLength(2);
    expect(store.strategyVersions[0]).toEqual(original);
    expect(store.strategyVersions[1]).toMatchObject({
      version: 2,
      analysisVersionId: store.analysisVersions[0].id,
    });
  });

  it.each(['analysisVersion', 'strategyVersion'] as const)(
    'rolls back the active state when %s persistence fails',
    async (failure) => {
      await seedAnalyzedWod();
      const previous = structuredClone(store);
      failWrite = failure;
      mocks.sendMessage.mockResolvedValue({
        text: JSON.stringify(failure === 'analysisVersion' ? ANALYSIS : STRATEGY),
      });
      expect(
        (await request('POST', failure === 'analysisVersion' ? 'analyze' : 'strategy')).statusCode,
      ).toBe(500);
      expect(store).toEqual(previous);
    },
  );

  for (const reanalysis of [false, true]) {
    it.each([
      { breakStrategy: [] },
      { movementStrategy: [] },
      { transitionStrategy: '   ' },
      { energyManagement: '   ' },
    ])(
      `rejects incomplete strategy after ${reanalysis ? 'reanalysis' : 'initial analysis'}: %j`,
      async (incomplete) => {
        if (reanalysis) await seedAnalyzedWod();
        expect((await request('POST', 'analyze')).statusCode).toBe(200);
        const previous = structuredClone(store);
        const calls = mocks.sendMessage.mock.calls.length;
        mocks.sendMessage.mockResolvedValue({
          text: JSON.stringify({ ...STRATEGY, ...incomplete }),
        });

        expect((await request('POST', 'strategy')).statusCode).toBe(502);
        expect(mocks.sendMessage.mock.calls.length - calls).toBe(2);
        expect(store).toEqual(previous);
        expect((await request('GET', 'strategy')).statusCode).toBe(404);
        expect(store.strategyVersions).toHaveLength(reanalysis ? 1 : 0);
      },
    );
  }

  it('persists only the complete strategy returned by the corrective retry', async () => {
    expect((await request('POST', 'analyze')).statusCode).toBe(200);
    mocks.sendMessage
      .mockResolvedValueOnce({ text: JSON.stringify({ ...STRATEGY, breakStrategy: [] }) })
      .mockResolvedValueOnce({ text: JSON.stringify(STRATEGY) });

    expect((await request('POST', 'strategy')).statusCode).toBe(200);
    expect(store.strategyVersions).toHaveLength(1);
    expect((await request('GET', 'strategy')).json().strategy).toMatchObject(STRATEGY);
  });

  it.each([false, true])(
    'rejects replacement after context assembly without mixing strategy input (reanalysis: %s)',
    async (reanalysis) => {
      if (reanalysis) await seedAnalyzedWod();
      expect((await request('POST', 'analyze')).statusCode).toBe(200);
      const targetWod = structuredClone({ ...store.wod, analysis: store.analysis });
      mocks.context.mockImplementationOnce(async () => {
        store.analysis = {
          ...store.analysis,
          versionId: 'replacement-version',
          durationMinutes: 12,
        };
        store.strategy = null;
        return { targetWod, context: CONTEXT };
      });
      const previousVersions = structuredClone(store.strategyVersions);
      mocks.sendMessage.mockResolvedValue({ text: JSON.stringify(STRATEGY) });
      expect((await request('POST', 'strategy')).statusCode).toBe(409);
      const prompt = mocks.sendMessage.mock.calls.at(-1)![0].messages[0].content[0].text;
      expect(JSON.parse(prompt.slice(prompt.indexOf('{')))).toMatchObject({
        wodAnalysis: { durationMinutes: 20, rounds: ANALYSIS.rounds },
        athleteContext: CONTEXT,
      });
      expect(store.analysis).toMatchObject({
        versionId: 'replacement-version',
        durationMinutes: 12,
      });
      expect(store.strategy).toBeNull();
      expect(store.strategyVersions).toEqual(previousVersions);
      expect(mocks.prisma.wod.findUniqueOrThrow).not.toHaveBeenCalled();
    },
  );

  it('saves initial analysis and strategy with the complete WOD and athlete context', async () => {
    await seedAnalyzedWod();
    expect(store.wod.rawText).toBe(RAW_WOD);
    expect(store.wod.result.score).toBe('18:30');
    expect(store.analysis).toMatchObject({
      durationMinutes: 20,
      roundBreakdown: ANALYSIS.rounds,
      movements: ANALYSIS.movements.map((movement) => expect.objectContaining(movement)),
    });
    const prompt = mocks.sendMessage.mock.calls[1][0].messages[0].content[0].text;
    const input = JSON.parse(prompt.slice(prompt.indexOf('{')));
    expect(input).toMatchObject({
      wodAnalysis: ANALYSIS,
      athleteContext: CONTEXT,
      athleteProfile: PROFILE,
    });
    expect((await request('GET', 'strategy')).json().strategy).toMatchObject(STRATEGY);
  });

  it('does not return the old strategy after reanalysis and failed regeneration', async () => {
    await seedAnalyzedWod();
    mocks.sendMessage.mockResolvedValue({
      text: JSON.stringify({ ...ANALYSIS, durationMinutes: 18 }),
    });
    expect((await request('POST', 'analyze')).statusCode).toBe(200);
    mocks.sendMessage.mockResolvedValue({ text: 'invalid json' });
    expect((await request('POST', 'strategy')).statusCode).toBe(502);
    expect((await request('GET', 'analysis')).json().analysis.durationMinutes).toBe(18);
    expect((await request('GET', 'strategy')).statusCode).toBe(404);
  });

  it('allows generating and reading a fresh strategy after reanalysis', async () => {
    await seedAnalyzedWod();
    expect((await request('POST', 'analyze')).statusCode).toBe(200);
    expect((await request('GET', 'strategy')).statusCode).toBe(404);
    mocks.sendMessage.mockResolvedValue({
      text: JSON.stringify({ ...STRATEGY, target: '15-18 min' }),
    });
    expect((await request('POST', 'strategy')).statusCode).toBe(200);
    expect((await request('GET', 'strategy')).json().strategy.target).toBe('15-18 min');
    const calls = mocks.sendMessage.mock.calls;
    expect(calls[0][0].messages).toEqual(calls[2][0].messages);
    expect(calls[1][0].messages).toEqual(calls[3][0].messages);
    expect(store.wod.rawText).toBe(RAW_WOD);
  });

  it.each(['', 'invalid json', '{"format":', '{}'])(
    'preserves the old pair when analysis is invalid: %j',
    async (text) => {
      await seedAnalyzedWod();
      const previous = structuredClone(store);
      mocks.sendMessage.mockResolvedValue({ text });
      expect((await request('POST', 'analyze')).statusCode).toBe(502);
      expect(store).toEqual(previous);
    },
  );

  it('preserves the old pair when the AI transport fails', async () => {
    await seedAnalyzedWod();
    const previous = structuredClone(store);
    mocks.sendMessage.mockRejectedValue(new Error('Transport timeout'));
    expect((await request('POST', 'analyze')).statusCode).toBe(500);
    expect(store).toEqual(previous);
  });

  it.each(['analysis', 'strategy', 'wod'] as const)(
    'rolls back all writes when %s persistence fails',
    async (failure) => {
      await seedAnalyzedWod();
      store.wod.rawText = null;
      store.wod.imageData = 'image-base64';
      store.wod.imageMimeType = 'image/png';
      store.wod.sourceType = 'IMAGE';
      const previous = structuredClone(store);
      mocks.sendMessage.mockResolvedValue({
        text: JSON.stringify({ ...ANALYSIS, extractedText: RAW_WOD }),
      });
      failWrite = failure;
      expect((await request('POST', 'analyze')).statusCode).toBe(500);
      expect(store).toEqual(previous);
    },
  );

  it('persists image extraction together with analysis and strategy invalidation', async () => {
    store.wod.rawText = null;
    store.wod.imageData = 'image-base64';
    store.wod.imageMimeType = 'image/png';
    store.wod.sourceType = 'IMAGE';
    mocks.sendMessage.mockResolvedValue({
      text: JSON.stringify({ ...ANALYSIS, extractedText: RAW_WOD }),
    });
    const response = await request('POST', 'analyze');
    expect(response.statusCode).toBe(200);
    expect(response.json().wod).toMatchObject({ rawText: RAW_WOD, sourceType: 'TEXT_AND_IMAGE' });
    expect(store.wod.imageData).toBe('image-base64');
    expect(store.analysis?.roundBreakdown).toEqual(ANALYSIS.rounds);
    expect(store.analysisVersions[0]).toMatchObject({
      sourceSnapshot: {
        rawText: null,
        imageData: 'image-base64',
        imageMimeType: 'image/png',
        sourceType: 'IMAGE',
      },
    });
    expect(store.strategy).toBeNull();
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
