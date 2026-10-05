import { test, expect } from '@playwright/test';
import { MOCK_ANALYSIS, MOCK_STRATEGY } from '../support/ai-mocks.js';

// API persistence is covered separately; these tests exercise the actual React UI.
for (const initialAnalysis of [false, true]) {
  test(`${initialAnalysis ? 'reanalysis' : 'initial analysis'} keeps the WOD visible after strategy failure and reload`, async ({
    page,
  }) => {
    const wod = {
      id: 'reanalysis-wod',
      userId: 'athlete-1',
      name: 'WOD regression',
      date: '2026-10-05T12:00:00.000Z',
      sourceType: 'TEXT',
      rawText: 'AMRAP 15\n10 Toes to Bar',
      imageData: null,
      imageMimeType: null,
      notes: null,
      result: { score: '8 rounds' },
    };
    let hasAnalysis = initialAnalysis;
    let strategy = initialAnalysis ? MOCK_STRATEGY.strategy : null;
    let failStrategy = true;
    let analysisCalls = 0;

    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();
      if (path === '/api/auth/me') {
        return route.fulfill({
          json: { user: { id: 'athlete-1', name: 'Test athlete', email: 'test@example.com' } },
        });
      }
      if (path === '/api/wods') return route.fulfill({ json: { wods: [wod] } });
      if (path === `/api/wods/${wod.id}`) return route.fulfill({ json: { wod } });
      if (path.endsWith('/analyze') && method === 'POST') {
        analysisCalls++;
        hasAnalysis = true;
        strategy = null;
        return route.fulfill({ json: { ...MOCK_ANALYSIS, wod: null } });
      }
      if (path.endsWith('/analysis')) {
        return route.fulfill(
          hasAnalysis ? { json: MOCK_ANALYSIS } : { status: 404, json: { error: 'Not analyzed' } },
        );
      }
      if (path.endsWith('/strategy')) {
        if (method === 'POST') {
          if (failStrategy)
            return route.fulfill({ status: 502, json: { error: 'Strategy failed' } });
          strategy = { ...MOCK_STRATEGY.strategy, target: '10-11 rounds' };
        }
        return route.fulfill(
          strategy ? { json: { strategy } } : { status: 404, json: { error: 'No strategy' } },
        );
      }
      return route.fulfill({ status: 404, json: { error: 'Unexpected test request' } });
    });

    await page.goto(`/wods/${wod.id}`);
    if (initialAnalysis) await expect(page.getByText('8-9 rounds', { exact: true })).toBeVisible();
    await page
      .getByRole('button', {
        name: initialAnalysis ? 'Reanalisar treino' : 'Analisar treino',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('button', { name: 'Reanalisar treino', exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole('button', { name: 'Gerar estrategia para hoje', exact: true }),
    ).toBeVisible();
    expect(analysisCalls).toBe(1);
    await expect(page.getByText('8-9 rounds', { exact: true })).toHaveCount(0);

    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Gerar estrategia para hoje', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('8-9 rounds', { exact: true })).toHaveCount(0);
    await expect(page.locator('pre')).toHaveText(wod.rawText);
    await expect(page.getByText('8 rounds', { exact: true })).toBeVisible();

    failStrategy = false;
    await page.getByRole('button', { name: 'Gerar estrategia para hoje', exact: true }).click();
    await expect(page.getByText('10-11 rounds', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('10-11 rounds', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Voltar', exact: true }).click();
    await expect(page.getByRole('link', { name: /WOD regression/ })).toBeVisible();
    await expect(page.getByText('8 rounds', { exact: true })).toBeVisible();
  });
}
