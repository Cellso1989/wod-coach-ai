import { test, expect } from '@playwright/test';
import { buildMonthlyRanking } from '../../../apps/api/src/lib/monthly-ranking.js';
import { rankingResult, rankingUsers } from '../../fixtures/monthly-ranking.js';

for (const width of [390, 1280]) {
  test(`athlete chooses ranking participation in profile and can leave at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.setFixedTime(new Date('2026-10-16T15:00:00Z'));
    let optedIn = false;
    let saves = 0;
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/auth/me'))
        return route.fulfill({ json: { user: { id: 'b', name: 'Rafael Lima' } } });
      if (url.pathname === '/api/athlete-profile') {
        if (route.request().method() === 'PUT') {
          optedIn = route.request().postDataJSON().rankingOptIn;
          saves++;
        }
        return route.fulfill({
          json: {
            profile: {
              rankingOptIn: optedIn,
              goals: [],
              injuries: [],
              limitedMovements: [],
              equipment: [],
            },
          },
        });
      }
      if (url.pathname === '/api/ranking/monthly')
        return route.fulfill({
          json: buildMonthlyRanking(
            rankingUsers.filter((user) => user.id === 'a' || (user.id === 'b' && optedIn)),
            [rankingResult('a', '05:00'), rankingResult('b', '06:00')],
            url.searchParams.get('month')!,
            'b',
          ),
        });
      return route.fulfill({ status: 404, json: {} });
    });
    await page.goto('/profile');
    const participation = page.getByRole('switch', { name: 'Participar do Ranking', exact: true });
    await expect(participation).not.toBeChecked();
    await participation.check();
    expect(saves).toBe(0);
    await page.getByRole('button', { name: 'Salvar perfil', exact: true }).click();
    await expect(page.getByText('Perfil salvo.', { exact: true })).toBeVisible();
    await page.reload();
    await expect(participation).toBeChecked();
    await expect(page.getByRole('status', { name: 'Abrindo WOD Coach AI' })).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath('profile-ranking-participation.png'),
      fullPage: true,
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.getByRole('link', { name: 'Ranking', exact: true }).click();
    const rows = page.getByRole('list', { name: 'Classificação mensal' });
    await expect(rows.getByRole('listitem')).toHaveCount(2);
    await expect(rows.getByText('Rafael Lima', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Perfil', exact: true }).click();
    await participation.uncheck();
    await page.getByRole('button', { name: 'Salvar perfil', exact: true }).click();
    await expect(page.getByText('Perfil salvo.', { exact: true })).toBeVisible();
    await page.reload();
    await expect(participation).not.toBeChecked();
    await page.getByRole('link', { name: 'Ranking', exact: true }).click();
    await expect(rows.getByRole('listitem')).toHaveCount(1);
    await expect(rows.getByText('Rafael Lima', { exact: true })).toHaveCount(0);
    await expect(
      page.getByText('Você ainda não está participando do Ranking.', { exact: true }),
    ).toBeVisible();
    expect(saves).toBe(2);
  });
}

test('a failed profile read cannot silently change participation and a failed save preserves the persisted choice', async ({
  page,
}) => {
  let readFails = true;
  let saveFails = true;
  let saves = 0;
  let optedIn = true;
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { user: { id: 'b', name: 'Rafael' } } });
    if (path === '/api/athlete-profile') {
      if (route.request().method() === 'PUT') {
        saves++;
        if (saveFails)
          return route.fulfill({
            status: 500,
            json: { error: 'Não foi possível salvar o perfil.' },
          });
        optedIn = route.request().postDataJSON().rankingOptIn;
      } else if (readFails) return route.fulfill({ status: 500, json: {} });
      return route.fulfill({ json: { profile: { rankingOptIn: optedIn } } });
    }
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto('/profile');
  await expect(
    page.getByText('Não foi possível carregar o perfil. Tente novamente antes de editar.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar perfil', exact: true })).toHaveCount(0);
  expect(saves).toBe(0);
  readFails = false;
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  const participation = page.getByRole('switch', { name: 'Participar do Ranking', exact: true });
  await expect(participation).toBeChecked();
  await participation.uncheck();
  await page.getByRole('button', { name: 'Salvar perfil', exact: true }).click();
  await expect(page.getByText('Não foi possível salvar o perfil.', { exact: true })).toBeVisible();
  expect(optedIn).toBe(true);
  await page.reload();
  await expect(participation).toBeChecked();
  saveFails = false;
  await participation.uncheck();
  await page.getByRole('button', { name: 'Salvar perfil', exact: true }).click();
  await expect(page.getByText('Perfil salvo.', { exact: true })).toBeVisible();
  expect(optedIn).toBe(false);
});

test('an athlete without a profile starts opted out', async ({ page }) => {
  await page.route('**/api/**', (route) =>
    new URL(route.request().url()).pathname.endsWith('/auth/me')
      ? route.fulfill({ json: { user: { id: 'new', name: 'Novo atleta' } } })
      : route.fulfill({ status: 404, json: {} }),
  );
  await page.goto('/profile');
  await expect(
    page.getByRole('switch', { name: 'Participar do Ranking', exact: true }),
  ).not.toBeChecked();
});
