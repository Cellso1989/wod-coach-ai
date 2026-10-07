import { test, expect } from '@playwright/test';
import { SubmitWodPage } from '../pages/submit-wod.page.js';
import { WodDetailPage } from '../pages/wod-detail.page.js';
import { loginAsNewUser } from '../support/auth-helper.js';
import { mockAiRoutes, MOCK_STRATEGY } from '../support/ai-mocks.js';

test('fluxo completo: enviar WOD, analisar, gerar estrategia automaticamente e registrar resultado', async ({
  page,
}) => {
  await loginAsNewUser(page);
  await mockAiRoutes(page);
  let releaseStrategy!: () => void;
  const strategyPending = new Promise<void>((resolve) => {
    releaseStrategy = resolve;
  });
  await page.route('**/wods/*/strategy', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
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
  await expect(page.getByText('AMRAP', { exact: true })).toBeVisible();
  await expect(page.getByText(/Toes to Bar/).first()).toBeVisible();

  const progress = page.getByRole('status').filter({
    hasText: 'Atleta, preparando seu sofrimento com estratégia 😂🔥',
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
  await expect(page.getByText(/Intensidade/)).toBeVisible();
  await expect(page.getByText(/Grip/).first()).toBeVisible();

  await wodDetailPage.fillResult('8 rounds + 5 reps');
  await expect(page.getByText('8 rounds + 5 reps')).toBeVisible();

  await page.reload();
  await expect(page.getByText('8 rounds + 5 reps', { exact: true })).toBeVisible();
});
