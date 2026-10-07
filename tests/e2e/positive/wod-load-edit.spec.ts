import { test, expect } from '@playwright/test';
import { MOCK_ANALYSIS, MOCK_STRATEGY } from '../support/ai-mocks.js';

for (const width of [320, 390, 1280]) {
  test(`manual loads persist through reload/reanalysis and require explicit strategy at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const movements = [
      {
        id: 'clean',
        name: 'Hang power clean',
        category: 'weightlifting',
        reps: 60,
        loadDescription: null as string | null,
      },
      { id: 't2b', name: 'Toes to Bar', category: 'gymnastics', reps: 50, loadDescription: null },
    ];
    let analysis = {
      ...MOCK_ANALYSIS.analysis,
      versionId: 'v1',
      durationMinutes: 16,
      movements,
      warnings: ['Carga nao informada para Hang power clean; confirme antes de executar.'],
      roundBreakdown: Array.from({ length: 5 }, (_, index) => ({
        roundNumber: index + 1,
        label: `Round ${index + 1}`,
        movements: [
          { ...movements[0], reps: 12 },
          { ...movements[1], reps: 10 },
        ],
      })),
    };
    let strategy: typeof MOCK_STRATEGY.strategy | null = MOCK_STRATEGY.strategy;
    let strategyPosts = 0;
    let analysisPosts = 0;
    let patches = 0;
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();
      if (path.endsWith('/auth/me'))
        return route.fulfill({ json: { user: { id: 'user', name: 'Athlete' } } });
      if (path === '/api/wods/loads')
        return route.fulfill({
          json: {
            wod: {
              id: 'loads',
              date: '2026-10-07',
              rawText: '5 RFT: 12 Hang power clean, 10 T2B',
              result: null,
            },
          },
        });
      if (path.endsWith('/analysis')) {
        if (method === 'PATCH') {
          patches++;
          expect(route.request().postDataJSON()).toEqual({
            versionId: analysis.versionId,
            movementLoads: [{ id: 'clean', loadDescription: '60/40 kg' }],
          });
          analysis = {
            ...analysis,
            versionId: 'v2',
            warnings: [],
            movements: [{ ...movements[0]!, loadDescription: '60/40 kg' }, movements[1]!],
            roundBreakdown: analysis.roundBreakdown.map((round) => ({
              ...round,
              movements: [
                { ...round.movements[0]!, loadDescription: '60/40 kg' },
                round.movements[1]!,
              ],
            })),
          };
          strategy = null;
        }
        return route.fulfill({ json: { analysis } });
      }
      if (path.endsWith('/analyze')) {
        analysisPosts++;
        strategy = null;
        analysis = { ...analysis, versionId: 'v3' };
        return route.fulfill({ json: { analysis } });
      }
      if (path.endsWith('/strategy')) {
        if (method === 'POST') {
          strategyPosts++;
          expect(analysis.movements[0]!.loadDescription).toBe('60/40 kg');
          strategy = MOCK_STRATEGY.strategy;
        }
        return route.fulfill(
          strategy ? { json: { strategy } } : { status: 404, json: { error: 'No strategy' } },
        );
      }
      return route.fulfill({ status: 404, json: { error: 'Not found' } });
    });
    await page.goto('/wods/loads');
    await expect(page.getByRole('region', { name: 'Estrategia de execucao' })).toBeVisible();
    await page.getByRole('button', { name: 'Editar cargas', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Reanalisar treino', exact: true }),
    ).toBeDisabled();
    await page.getByRole('textbox', { name: 'Hang power clean', exact: true }).fill('60/40 kg');
    await page.getByRole('button', { name: 'Salvar cargas', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Gerar estrategia para hoje', exact: true }),
    ).toBeEnabled();
    await expect(page.getByText('60/40 kg', { exact: true })).toHaveCount(5);
    await expect(page.getByText(/Falta informar a carga/)).toHaveCount(0);
    expect(patches).toBe(1);
    expect(analysisPosts).toBe(0);
    expect(strategyPosts).toBe(0);
    await page.reload();
    await expect(page.getByText('60/40 kg', { exact: true })).toHaveCount(5);
    await page.getByRole('button', { name: 'Reanalisar treino', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Gerar estrategia para hoje', exact: true }),
    ).toBeEnabled();
    await expect(page.getByRole('button', { name: /16 min/ })).toBeVisible();
    expect(strategyPosts).toBe(0);
    await page.getByRole('button', { name: 'Gerar estrategia para hoje', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Estrategia de execucao' })).toBeVisible();
    expect(strategyPosts).toBe(1);
    expect(analysisPosts).toBe(1);
    await page.getByRole('button', { name: 'Editar cargas', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Hang power clean', exact: true })).toHaveValue(
      '60/40 kg',
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: test.info().outputPath('load-editor.png'), fullPage: true });
  });
}

test('failed load save keeps the analysis and entered values and allows cancellation', async ({
  page,
}) => {
  let patches = 0;
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { user: { id: 'user', name: 'Athlete' } } });
    if (path === '/api/wods/loads')
      return route.fulfill({
        json: { wod: { id: 'loads', date: '2026-10-07', rawText: 'Treino', result: null } },
      });
    if (path.endsWith('/analysis')) {
      if (route.request().method() === 'PATCH') {
        patches++;
        return route.fulfill({
          status: 409,
          json: { error: 'A analise mudou. Atualize o treino antes de editar.' },
        });
      }
      return route.fulfill({
        json: {
          analysis: {
            ...MOCK_ANALYSIS.analysis,
            movements: [
              {
                id: 'clean',
                name: 'Hang power clean',
                category: 'weightlifting',
                reps: 12,
                loadDescription: null,
              },
            ],
          },
        },
      });
    }
    return route.fulfill({ status: 404, json: { error: 'Not found' } });
  });
  await page.goto('/wods/loads');
  await page.getByRole('button', { name: 'Editar cargas', exact: true }).click();
  await page.getByRole('textbox', { name: 'Hang power clean', exact: true }).fill('50 kg');
  await page.getByRole('button', { name: 'Salvar cargas', exact: true }).click();
  await expect(
    page.getByText('A analise mudou. Atualize o treino antes de editar.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Hang power clean', exact: true })).toHaveValue(
    '50 kg',
  );
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Gerar estrategia para hoje', exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Reanalisar treino', exact: true })).toBeEnabled();
  await expect(page.getByText('50 kg', { exact: true })).toHaveCount(0);
  expect(patches).toBe(1);
});
