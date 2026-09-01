import type { Page } from "@playwright/test";

/**
 * Fixtures matching the shape our API returns for /analyze and /strategy.
 * Intercepted at the network level so E2E runs never spend real Claude
 * API credits and never depend on AI non-determinism (seção 31).
 */

export const MOCK_ANALYSIS = {
  analysis: {
    id: "mock-analysis-id",
    wodId: "mock-wod-id",
    format: "AMRAP",
    durationMinutes: 15,
    stimulus: "mixed_modal",
    estimatedIntensity: 8,
    engineDemand: 8,
    gripDemand: 7,
    legDemand: 7,
    gymnasticsDemand: 6,
    technicalDemand: 4,
    confidence: 0.85,
    warnings: [],
    movements: [
      {
        id: "mock-movement-1",
        order: 0,
        name: "Toes to Bar",
        category: "gymnastics",
        reps: 10,
        distanceMeters: null,
        loadDescription: null,
        calories: null,
      },
    ],
  },
};

export const MOCK_STRATEGY = {
  strategy: {
    id: "mock-strategy-id",
    wodId: "mock-wod-id",
    recommendedIntensity: 8,
    targetRpe: 8,
    loadRecommendation: null,
    pacing: "Ritmo controlado no início, acelerar nos últimos 3 minutos.",
    breakStrategy: [{ movement: "Toes to Bar", strategy: "5 + 5 desde o início." }],
    restStrategy: "Descansos curtos entre rodadas.",
    movementStrategy: [{ movement: "Toes to Bar", strategy: "Kip ritmado." }],
    transitionStrategy: "Minimizar tempo parado.",
    energyManagement: "Controlar esforço no início.",
    goal: "Manter consistência.",
    target: "8-9 rounds",
    criticalPoint: "Grip",
    confidence: 0.85,
    warnings: [],
  },
};

export const MOCK_CONTEXT = {
  context: {
    trainingLoad: {
      last7Days: { days: 7, sessionCount: 0, averageRpe: null, averageReadiness: null },
      last14Days: { days: 14, sessionCount: 0, averageRpe: null, averageReadiness: null },
      last28Days: { days: 28, sessionCount: 0, averageRpe: null, averageReadiness: null },
    },
    readinessTrend: "insufficient_data",
    similarWods: [],
    relevantPersonalRecords: [],
    dataSufficiency: "low",
  },
};

export async function mockAiRoutes(page: Page) {
  await page.route("**/wods/*/analyze", (route) =>
    route.fulfill({ status: 200, json: MOCK_ANALYSIS }),
  );
  // A página busca GET /strategy ao carregar (ainda sem estratégia) e
  // só faz POST /strategy quando o atleta clica em "Gerar estratégia" —
  // mockar os dois métodos com a mesma resposta faria a estratégia
  // aparecer antes do clique, pulando o estado "botão disponível".
  await page.route("**/wods/*/strategy", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ status: 404, json: { error: "This WOD has no strategy yet" } });
    }
    return route.fulfill({ status: 200, json: MOCK_STRATEGY });
  });
  await page.route("**/wods/*/context", (route) =>
    route.fulfill({ status: 200, json: MOCK_CONTEXT }),
  );
}
