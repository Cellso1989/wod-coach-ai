import { test, expect } from '@playwright/test';
import { buildMonthlyRanking } from '../../../apps/api/src/lib/monthly-ranking.js';
import { rankingResult, rankingUsers } from '../../fixtures/monthly-ranking.js';

const results = [
  rankingResult('a', '05:00'),
  rankingResult('b', '06:00'),
  rankingResult('c', 'CAP 10'),
  rankingResult('d', 'CAP 20'),
];

for (const width of [390, 1280]) {
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
    await page.screenshot({ path: testInfo.outputPath('ranking-preview.png'), fullPage: true });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
}

for (const width of [390, 1280]) {
  test(`monthly performance ranking supports search, details and empty months at ${width}px`, async ({
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
          json: buildMonthlyRanking(rankingUsers, results, url.searchParams.get('month')!, 'b'),
        });
      return route.fulfill({ status: 404, json: { error: 'Not found' } });
    });
    await page.goto('/ranking');
    await expect(
      page.getByRole('status', { name: 'Abrindo WOD Coach AI', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Ranking', exact: true })).toBeVisible();
    const rows = page.getByRole('list', { name: 'Classificação mensal' });
    await expect(rows.getByRole('listitem')).toHaveCount(5);
    await expect(rows.getByRole('listitem').filter({ hasText: 'Rafael Lima' })).toContainText('75');
    await expect(rows.getByRole('listitem').filter({ hasText: 'Luiza Santos' })).toContainText(
      'Sem classificação',
    );
    await rows.locator('summary').filter({ hasText: 'Rafael Lima' }).click();
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
    await page.getByLabel('Mês da classificação').fill('2026-09');
    await expect(page.getByText('O próximo destaque pode ser você.')).toBeVisible();
    await expect(rows.getByRole('listitem')).toHaveCount(5);
    await expect(rows.getByText('Sem classificação', { exact: true })).toHaveCount(5);
    await page.getByText('Como o ranking é calculado', { exact: true }).click();
    await expect(page.getByText(/a média dos confrontos forma/i)).toBeVisible();
  });
}

test('ranking recovers after an API failure and does not display stale month data', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-16T15:00:00Z'));
  let fail = true;
  let releaseSeptember!: () => void;
  const september = new Promise<void>((resolve) => {
    releaseSeptember = resolve;
  });
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/me'))
      return route.fulfill({ json: { user: { id: 'b', name: 'Rafael' } } });
    if (url.pathname === '/api/ranking/monthly') {
      if (fail) return route.fulfill({ status: 500, json: { error: 'Ranking indisponível.' } });
      const month = url.searchParams.get('month')!;
      if (month === '2026-09') await september;
      return route.fulfill({ json: buildMonthlyRanking(rankingUsers, results, month, 'b') });
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
  const septemberRequest = page.waitForRequest((request) =>
    request.url().includes('month=2026-09'),
  );
  await page.getByLabel('Mês da classificação').fill('2026-09');
  await septemberRequest;
  await expect(
    page.getByRole('status').filter({ hasText: 'Carregando classificação...' }),
  ).toBeVisible();
  await page.getByLabel('Mês da classificação').fill('2026-10');
  await expect(page.getByRole('region', { name: 'Destaques do mês' })).toContainText(
    'Marina Costa',
  );
  releaseSeptember();
  await expect(page.getByLabel('Mês da classificação')).toHaveValue('2026-10');
  await expect(
    page.getByRole('list', { name: 'Classificação mensal' }).getByRole('listitem'),
  ).toHaveCount(5);
});
