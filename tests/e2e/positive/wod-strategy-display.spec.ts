import { test, expect } from '@playwright/test';
import { MOCK_ANALYSIS, MOCK_CONTEXT, MOCK_STRATEGY } from '../support/ai-mocks.js';
import type { WodStrategy } from '../../../apps/web/src/lib/api.js';

const COMPLETE = {
  ...MOCK_STRATEGY.strategy,
  recommendedIntensity: 9,
  targetRpe: 10,
  pacing: 'Controle a abertura; acelere nos ultimos 3 minutos.',
  restStrategy: 'Descanse 5 segundos entre os blocos.',
  movementStrategy: [{ movement: 'Toes to Bar', strategy: 'Mantenha o kip curto e ritmado.' }],
  transitionStrategy: 'Passe para a corrida sem parar.',
  energyManagement: 'Preserve o grip nos primeiros rounds.',
  warnings: ['Se houver dor, interrompa o movimento e procure orientacao do coach.'],
};

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
]) {
  for (const reanalysis of [false, true]) {
    test(`shows complete strategy after ${reanalysis ? 'reanalysis' : 'initial analysis'} and reload at ${viewport.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const wod = {
        id: 'strategy-display-wod',
        userId: 'athlete-1',
        name: 'Strategy display WOD',
        date: '2026-10-05T12:00:00.000Z',
        sourceType: 'TEXT',
        rawText: 'AMRAP 15\n10 Toes to Bar',
        imageData: null,
        imageMimeType: null,
        notes: null,
        result: null,
      };
      let hasAnalysis = reanalysis;
      let strategy: WodStrategy | null = reanalysis
        ? { ...COMPLETE, pacing: 'Old pacing', warnings: ['Old warning'] }
        : null;
      await page.route('**/api/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        const method = route.request().method();
        if (path === '/api/auth/me')
          return route.fulfill({
            json: { user: { id: 'athlete-1', name: 'Test athlete', email: 'test@example.com' } },
          });
        if (path === `/api/wods/${wod.id}`) return route.fulfill({ json: { wod } });
        if (path.endsWith('/analyze')) {
          hasAnalysis = true;
          strategy = null;
          return route.fulfill({ json: { ...MOCK_ANALYSIS, wod: null } });
        }
        if (path.endsWith('/analysis'))
          return route.fulfill(
            hasAnalysis ? { json: MOCK_ANALYSIS } : { status: 404, json: { error: 'No analysis' } },
          );
        if (path.endsWith('/context')) return route.fulfill({ json: MOCK_CONTEXT });
        if (path.endsWith('/strategy')) {
          if (method === 'POST') strategy = COMPLETE;
          return route.fulfill(
            strategy ? { json: { strategy } } : { status: 404, json: { error: 'No strategy' } },
          );
        }
        return route.fulfill({ status: 404, json: { error: 'Unexpected request' } });
      });
      await page.goto(`/wods/${wod.id}`);
      await page
        .getByRole('button', {
          name: reanalysis ? 'Reanalisar treino' : 'Analisar treino',
          exact: true,
        })
        .click();
      await page.getByRole('button', { name: 'Gerar estrategia para hoje', exact: true }).click();
      for (const reload of [false, true]) {
        if (reload) await page.reload();
        for (const text of [
          COMPLETE.pacing,
          COMPLETE.restStrategy,
          COMPLETE.movementStrategy[0]!.strategy,
          COMPLETE.transitionStrategy,
          COMPLETE.energyManagement,
          COMPLETE.warnings[0]!,
          COMPLETE.breakStrategy[0]!.strategy,
          COMPLETE.goal,
          COMPLETE.target!,
        ])
          await expect(page.getByText(text, { exact: true })).toBeVisible();
        await expect(page.getByText('Old pacing', { exact: true })).toHaveCount(0);
        await expect(page.getByText('Old warning', { exact: true })).toHaveCount(0);
        const strategyRegion = page.getByRole('region', {
          name: 'Estrategia de execucao',
          exact: true,
        });
        await expect(strategyRegion).toBeVisible();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
        expect(
          await strategyRegion.evaluate((element) =>
            [...element.querySelectorAll('p, h3, li, dt, dd')].every(
              (node) => node.scrollWidth <= node.clientWidth + 1,
            ),
          ),
        ).toBe(true);
      }
      await page.getByRole('region', { name: 'Estrategia de execucao', exact: true }).screenshot({
        path: `output/playwright/strategy-${reanalysis ? 'reanalysis' : 'initial'}-${viewport.width}.png`,
      });
      strategy = {
        ...COMPLETE,
        target: null,
        criticalPoint: null,
        loadRecommendation: null,
        warnings: [],
        breakStrategy: [],
        movementStrategy: [],
      };
      await page.reload();
      await expect(page.getByText(COMPLETE.goal, { exact: true })).toBeVisible();
      await expect(
        page.getByRole('region', { name: 'Pontos de atencao', exact: true }),
      ).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Quebras', exact: true })).toHaveCount(0);
      await expect(
        page.getByRole('heading', { name: 'Execucao por movimento', exact: true }),
      ).toHaveCount(0);
    });
  }
}
