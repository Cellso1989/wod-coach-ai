import { test, expect } from '@playwright/test';
import { buildMonthlyRanking } from '../../../apps/api/src/lib/monthly-ranking.js';
import { rankingResult, rankingUsers } from '../../fixtures/monthly-ranking.js';

const results = [
  rankingResult('a', '05:00'),
  rankingResult('b', '06:00'),
  rankingResult('c', 'CAP 10'),
  rankingResult('d', 'CAP 20'),
];
const dailyNow = new Date('2026-10-16T15:00:00Z');
const buildTestRanking = (
  users: typeof rankingUsers,
  records: ReturnType<typeof rankingResult>[],
  userId: string,
  now: Date,
) => buildMonthlyRanking(users, records, '2026-10', userId, now);
const previousResults = ['a', 'b'].map((id, index) => {
  const result = rankingResult(id, index === 0 ? '08:00' : '09:00');
  result.createdAt = new Date('2026-10-15T15:00:00Z');
  result.wod.name = 'Treino anterior';
  result.wod.analysis!.movements[0]!.reps = 30;
  return result;
});

for (const width of [320, 390, 1280]) {
  test(`local preview is clearly fictional and works without login at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/**', (route) =>
      route.fulfill({ status: 401, json: { error: 'Não autenticado' } }),
    );
    await page.goto('/preview/ranking');
    await expect(
      page.getByRole('status', { name: 'Abrindo WOD Coach AI', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText('Prévia local · atletas e resultados fictícios')).toBeVisible();
    await expect(
      page.getByRole('list', { name: 'Classificação mensal' }).getByRole('listitem'),
    ).toHaveCount(8);
    const highlights = page.getByRole('region', { name: 'Destaques do mês' });
    await expect(highlights).toContainText('225');
    await expect(highlights).toContainText('150');
    await expect(highlights).toContainText('Acumulado do mês');
    await expect(page.locator('input[type="month"]')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('ranking-preview.png'), fullPage: true });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
}

for (const width of [320, 390, 1280]) {
  test(`daily ranking excludes older WODs and supports search and details at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.setFixedTime(new Date('2026-10-16T15:00:00Z'));
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/auth/me'))
        return route.fulfill({ json: { user: { id: 'b', name: 'Rafael Lima' } } });
      if (url.pathname === '/api/ranking/monthly')
        return route.fulfill({
          json: buildTestRanking(rankingUsers, [...results, ...previousResults], 'b', dailyNow),
        });
      return route.fulfill({ status: 404, json: { error: 'Not found' } });
    });
    await page.goto('/ranking');
    await expect(
      page.getByRole('status', { name: 'Abrindo WOD Coach AI', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Ranking', exact: true })).toBeVisible();
    if (width < 640) {
      const heading = await page
        .getByRole('heading', { name: 'Ranking', exact: true })
        .boundingBox();
      expect(heading!.x).toBe(16);
      await expect
        .poll(() =>
          page.locator('nav').evaluate((nav) => {
            const link = nav.querySelector('a[href="/ranking"]')!;
            const menuBounds = nav.getBoundingClientRect();
            const linkBounds = link.getBoundingClientRect();
            return linkBounds.left >= menuBounds.left && linkBounds.right <= menuBounds.right;
          }),
        )
        .toBe(true);
      expect(await page.evaluate(() => window.scrollX)).toBe(0);
    }
    const rows = page.getByRole('list', { name: 'Classificação mensal' });
    await expect(rows.getByRole('listitem')).toHaveCount(5);
    await expect(rows.getByRole('listitem').filter({ hasText: 'Rafael Lima' })).toContainText(
      '125',
    );
    await expect(rows.getByRole('listitem').filter({ hasText: 'Luiza Santos' })).toContainText(
      'Sem classificação',
    );
    await rows.locator('summary').filter({ hasText: 'Rafael Lima' }).click();
    const rafaelRow = rows.getByRole('listitem').filter({ hasText: 'Rafael Lima' });
    await expect(rafaelRow.getByText('Colocação no Wod de hoje', { exact: true })).toBeVisible();
    await expect(rows.getByText('Treino anterior', { exact: true })).toHaveCount(0);
    await expect(rows.getByText('09:00', { exact: false })).toHaveCount(0);
    await expect(rows.getByText('06:00', { exact: false })).toBeVisible();
    await expect(rows.getByText('75 pts', { exact: true })).toBeVisible();
    const capRow = rows.getByRole('listitem').filter({ hasText: 'Camila Souza' });
    const lowerCapRow = rows.getByRole('listitem').filter({ hasText: 'Diego Martins' });
    await capRow.locator('summary').click();
    await expect(capRow).toContainText('Faltaram 10 reps');
    await expect(capRow.getByText('50 pts', { exact: true })).toBeVisible();
    await lowerCapRow.locator('summary').click();
    await expect(lowerCapRow).toContainText('Faltaram 20 reps');
    await expect(lowerCapRow.getByText('25 pts', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('monthly-ranking.png'), fullPage: true });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    await page.getByRole('button', { name: 'Classificados', exact: true }).click();
    await expect(rows.getByRole('listitem')).toHaveCount(4);
    await page.getByPlaceholder('Buscar atleta').fill('luiza');
    await expect(page.getByText('Nenhum atleta encontrado para essa busca.')).toBeVisible();
    await page.getByRole('button', { name: 'Todos os atletas', exact: true }).click();
    await expect(rows.getByRole('listitem')).toHaveCount(1);
    await page.getByPlaceholder('Buscar atleta').clear();
    await expect(rows.getByRole('listitem')).toHaveCount(5);
    await rows.locator('summary').filter({ hasText: 'Luiza Santos' }).click();
    await expect(
      rows
        .getByRole('listitem')
        .filter({ hasText: 'Luiza Santos' })
        .getByText('Nenhum resultado comparável deste atleta hoje.', { exact: true }),
    ).toBeVisible();
    await page.getByText('Como o ranking é calculado', { exact: true }).click();
    await expect(page.getByText(/cada atleta recebe uma única pontuação por dia/i)).toBeVisible();
  });
}

test('daily ranking recovers after an API failure', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-16T15:00:00Z'));
  let fail = true;
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/me'))
      return route.fulfill({ json: { user: { id: 'b', name: 'Rafael' } } });
    if (url.pathname === '/api/ranking/monthly') {
      if (fail) return route.fulfill({ status: 500, json: { error: 'Ranking indisponível.' } });
      return route.fulfill({ json: buildTestRanking(rankingUsers, results, 'b', dailyNow) });
    }
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto('/ranking');
  await expect(page.getByText('Ranking indisponível.', { exact: true })).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('region', { name: 'Destaques do mês' })).toContainText(
    'Marina Costa',
  );
  await expect(
    page.getByRole('list', { name: 'Classificação mensal' }).getByRole('listitem'),
  ).toHaveCount(5);
});

test('monthly total persists without a result today and details show no older WOD', async ({
  page,
}) => {
  await page.clock.setFixedTime(dailyNow);
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/me'))
      return route.fulfill({ json: { user: { id: 'b', name: 'Rafael' } } });
    if (url.pathname === '/api/ranking/monthly')
      return route.fulfill({
        json: buildTestRanking(rankingUsers, previousResults, 'b', dailyNow),
      });
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto('/ranking');
  await expect(page.getByRole('region', { name: 'Destaques do mês' })).toContainText('100');
  const rows = page.getByRole('list', { name: 'Classificação mensal' });
  await expect(rows.getByText('Sem classificação', { exact: true })).toHaveCount(3);
  const rafael = rows.getByRole('listitem').filter({ hasText: 'Rafael Lima' });
  await expect(rafael).toContainText('50');
  await rafael.locator('summary').click();
  await expect(
    rafael.getByText('Nenhum resultado comparável deste atleta hoje.', { exact: true }),
  ).toBeVisible();
  await expect(rows.getByText('Treino anterior', { exact: true })).toHaveCount(0);
});
