import { test, expect } from '@playwright/test';
import { SubmitWodPage } from '../pages/submit-wod.page.js';
import { WodDetailPage } from '../pages/wod-detail.page.js';
import { loginAsNewUser } from '../support/auth-helper.js';
import { mockAiRoutes, MOCK_STRATEGY, MOCK_ANALYSIS } from '../support/ai-mocks.js';

test('fluxo completo: enviar WOD, analisar, solicitar estrategia e registrar resultado', async ({
  page,
}) => {
  await loginAsNewUser(page);
  await mockAiRoutes(page);
  let strategyPosts = 0;
  let releaseAnalysis!: () => void;
  const analysisPending = new Promise<void>((resolve) => {
    releaseAnalysis = resolve;
  });
  await page.route('**/wods/*/analyze', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await analysisPending;
    await route.fulfill({ status: 200, json: MOCK_ANALYSIS });
  });
  let releaseStrategy!: () => void;
  const strategyPending = new Promise<void>((resolve) => {
    releaseStrategy = resolve;
  });
  await page.route('**/wods/*/strategy', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    strategyPosts++;
    await strategyPending;
    await route.fulfill({ status: 200, json: MOCK_STRATEGY });
  });

  const submitWodPage = new SubmitWodPage(page);
  await submitWodPage.goto();
  await submitWodPage.fillText('15 min AMRAP\n10 Toes to Bar\n15 Wall Balls\n200m Run', 'Meu WOD');
  await submitWodPage.submit();

  // A submissão redireciona para /wods/:id
  await page.waitForURL(/\/wods\/[^/]+$/);

  const wodDetailPage = new WodDetailPage(page);
  await wodDetailPage.analyze();
  try {
    await expect(page.getByRole('status')).toHaveText('Analisando o Wod para nosso Atleta');
  } finally {
    releaseAnalysis();
  }
  await expect(page.getByText('AMRAP', { exact: true })).toBeVisible();
  await expect(page.getByText(/Toes to Bar/).first()).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Gerar estrategia para hoje', exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole('status')).toHaveCount(0);
  expect(strategyPosts).toBe(0);
  await wodDetailPage.generateStrategy();

  const progress = page.getByRole('status').filter({
    hasText: 'Preparando seu sofrimento com estratégia 😂🔥',
  });
  await expect(progress).toBeVisible();
  try {
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(async () => {
        const fits = await progress.locator('span').evaluate((label) => {
          const bounds = label.getBoundingClientRect();
          const parent = label.parentElement!.getBoundingClientRect();
          return bounds.width <= parent.width + 1 && bounds.height <= 25;
        });
        expect(fits).toBe(true);
      }).toPass();
      await progress.screenshot({ path: test.info().outputPath(`strategy-progress-${width}.png`) });
    }
  } finally {
    releaseStrategy();
  }

  await expect(page.locator('section[aria-label="Estrategia de execucao"]')).toBeVisible();
  expect(strategyPosts).toBe(1);
  await expect(page.getByText(/Intensidade/)).toBeVisible();
  await expect(page.getByText(/Grip/).first()).toBeVisible();

  await wodDetailPage.fillResult('8 rounds + 5 reps');
  await expect(page.getByText('8 rounds + 5 reps')).toBeVisible();

  await page.reload();
  await expect(page.getByText('8 rounds + 5 reps', { exact: true })).toBeVisible();
});

for (const width of [390, 1280]) {
  for (const hasTime of [true, false]) {
    test(`analysis displays optional timing and load warnings at ${width}px (time: ${hasTime})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.route('**/api/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith('/auth/me'))
          return route.fulfill({ json: { user: { id: 'test', name: 'Atleta' } } });
        if (path.endsWith('/analysis'))
          return route.fulfill({
            json: {
              analysis: {
                ...MOCK_ANALYSIS.analysis,
                format: 'FOR_TIME',
                durationMinutes: hasTime ? 15 : null,
                movements: [
                  { name: 'Thrusters', category: 'weightlifting', reps: 45, loadDescription: null },
                  { name: 'Toes to Bar', category: 'gymnastics', reps: 45 },
                ],
                rawResponse: { targetMinutes: hasTime ? 10 : null },
                warnings: [
                  ...(!hasTime ? ['Tempo ou time cap nao informado.'] : []),
                  'Carga nao informada para Thrusters; confirme antes de executar.',
                ],
              },
            },
          });
        if (path.endsWith('/strategy'))
          return route.fulfill({ status: 404, json: { error: 'Sem estrategia' } });
        if (path === '/api/wods/optional-time')
          return route.fulfill({
            json: {
              wod: {
                id: 'optional-time',
                name: 'Treino',
                date: '2026-10-07T12:00:00.000Z',
                rawText: '21-15-9 Thrusters e T2B',
                sourceType: 'TEXT',
                createdAt: '2026-10-07T12:00:00.000Z',
                result: null,
              },
            },
          });
        return route.fulfill({ status: 404, json: { error: 'Nao encontrado' } });
      });
      await page.goto('/wods/optional-time');
      await expect(page.getByText('07/10/2026', { exact: true })).toBeVisible();
      await expect(page.getByText('For Time', { exact: true })).toBeVisible();
      await expect(page.getByRole('list', { name: 'Avisos da análise' })).toContainText(
        'Carga nao informada',
      );
      if (hasTime) {
        await expect(page.getByText('Target (meta): 10 min', { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: /Time cap: 15 min/ })).toBeVisible();
      } else {
        await expect(page.getByRole('list', { name: 'Avisos da análise' })).toContainText(
          'Tempo ou time cap nao informado',
        );
        await expect(page.getByRole('button', { name: /Definir tempo/ })).toBeVisible();
      }
      await page.screenshot({
        path: test.info().outputPath('optional-time-analysis.png'),
        fullPage: true,
      });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    });
  }
}
