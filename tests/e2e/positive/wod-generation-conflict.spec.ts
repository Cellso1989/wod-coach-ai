import { test, expect } from '@playwright/test';
import { MOCK_ANALYSIS, MOCK_STRATEGY } from '../support/ai-mocks.js';

const BUSY = 'Este WOD ja tem uma geracao em andamento. Aguarde e atualize o treino.';

for (const reanalysis of [false, true]) {
  test(`busy ${reanalysis ? 'reanalysis' : 'initial analysis'} preserves the active state and permits explicit retry`, async ({
    page,
  }) => {
    let busy = true;
    let hasAnalysis = reanalysis;
    let hasStrategy = reanalysis;
    let strategyPosts = 0;
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();
      if (path.endsWith('/auth/me'))
        return route.fulfill({ json: { user: { id: 'user', name: 'Athlete' } } });
      if (path === '/api/wods/reservation')
        return route.fulfill({
          json: {
            wod: {
              id: 'reservation',
              name: 'Reservation WOD',
              date: '2026-10-05',
              sourceType: 'TEXT',
              rawText: 'AMRAP 15: 10 Toes to Bar',
              result: { score: '8 rounds' },
            },
          },
        });
      if (path.endsWith('/analyze')) {
        if (busy) return route.fulfill({ status: 409, json: { error: BUSY } });
        hasAnalysis = true;
        hasStrategy = false;
        return route.fulfill({ json: { ...MOCK_ANALYSIS, wod: null } });
      }
      if (path.endsWith('/analysis'))
        return route.fulfill(
          hasAnalysis ? { json: MOCK_ANALYSIS } : { status: 404, json: { error: 'No analysis' } },
        );
      if (path.endsWith('/strategy')) {
        if (method === 'POST') {
          strategyPosts++;
          hasStrategy = true;
        }
        return route.fulfill(
          hasStrategy ? { json: MOCK_STRATEGY } : { status: 404, json: { error: 'No strategy' } },
        );
      }
      return route.fulfill({ status: 404, json: { error: 'Not found' } });
    });
    await page.goto('/wods/reservation');
    const button = page.getByRole('button', {
      name: reanalysis ? 'Reanalisar treino' : 'Analisar treino',
      exact: true,
    });
    await button.click();
    await expect(page.getByText(BUSY, { exact: true })).toBeVisible();
    await expect(button).toBeEnabled();
    await expect(page.getByText('AMRAP 15: 10 Toes to Bar', { exact: true })).toBeVisible();
    await expect(page.getByText('8 rounds', { exact: true })).toBeVisible();
    if (reanalysis)
      await expect(page.getByText(MOCK_STRATEGY.strategy.pacing, { exact: true })).toBeVisible();
    expect(strategyPosts).toBe(0);
    busy = false;
    await button.click();
    await expect(page.getByText(MOCK_STRATEGY.strategy.pacing, { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Reanalisar treino', exact: true }),
    ).toBeEnabled();
    await expect(page.getByText(BUSY, { exact: true })).toHaveCount(0);
    expect(strategyPosts).toBe(1);
  });
}

test('busy manual strategy leaves the analysis intact and permits explicit retry', async ({
  page,
}) => {
  let busy = true;
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { user: { id: 'user', name: 'Athlete' } } });
    if (path === '/api/wods/reservation')
      return route.fulfill({
        json: {
          wod: {
            id: 'reservation',
            name: 'Reservation WOD',
            date: '2026-10-05',
            sourceType: 'TEXT',
            rawText: 'Fonte preservada',
          },
        },
      });
    if (path.endsWith('/analysis')) return route.fulfill({ json: MOCK_ANALYSIS });
    if (path.endsWith('/strategy')) {
      if (route.request().method() === 'GET')
        return route.fulfill({ status: 404, json: { error: 'No strategy' } });
      return route.fulfill(busy ? { status: 409, json: { error: BUSY } } : { json: MOCK_STRATEGY });
    }
    return route.fulfill({ status: 404, json: { error: 'Not found' } });
  });
  await page.goto('/wods/reservation');
  const button = page.getByRole('button', { name: 'Gerar estrategia para hoje', exact: true });
  await button.click();
  await expect(page.getByText(BUSY, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reanalisar treino', exact: true })).toBeEnabled();
  await expect(page.getByText('Fonte preservada', { exact: true })).toBeVisible();
  busy = false;
  await button.click();
  await expect(page.getByText(MOCK_STRATEGY.strategy.pacing, { exact: true })).toBeVisible();
  await expect(page.getByText(BUSY, { exact: true })).toHaveCount(0);
});
