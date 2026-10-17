import { test, expect, type Page, type Route } from '@playwright/test';

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

const todayWod = {
  id: 'today',
  name: 'Treino de hoje',
  date: '2026-10-16T15:00:00Z',
  rawText: '21-15-9 Thrusters e Pull-ups',
  sourceType: 'TEXT',
  result: { score: '05:00' },
};

async function mock(page: Page, intercept: (route: Route, path: string) => Promise<boolean>) {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me')
      return route.fulfill({ json: { user: { id: 'athlete', name: 'Atleta' } } });
    if (await intercept(route, path)) return;
    if (path === '/api/stats/training-calendar') return route.fulfill({ json: { entries: [] } });
    if (path === '/api/hyrox-workouts') return route.fulfill({ json: { workouts: [] } });
    return route.fulfill({ status: 404, json: { error: 'Not found' } });
  });
}

for (const width of [390, 1280]) {
  test(`calendar and navigation do not wait for WODs; WODs do not wait for check-in at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.setFixedTime(new Date('2026-10-16T15:00:00Z'));
    const wods = gate();
    const checkin = gate();
    await mock(page, async (route, path) => {
      if (path === '/api/wods') {
        await wods.promise;
        await route.fulfill({ json: { wods: [todayWod] } });
        return true;
      }
      if (path === '/api/checkins/today') {
        await checkin.promise;
        await route.fulfill({ json: { checkin: { id: 'checkin' } } });
        return true;
      }
      return false;
    });
    try {
      await page.goto('/');
      await expect(
        page.getByRole('status', { name: 'Abrindo WOD Coach AI', exact: true }),
      ).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'HYROX', exact: true })).toBeVisible();
      await expect(page.getByText('0 de 7 dias com resultado nesta semana')).toBeVisible();
      await expect(page.getByRole('status')).toHaveText('Carregando seus WODs...');
      await expect(page.getByText("Wod's Realizados", { exact: true })).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath('dashboard-pending.png'), fullPage: true });

      wods.release();
      await expect(
        page.getByRole('heading', { name: 'Treino de hoje', exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('link', { name: 'Ver treino de hoje' })).toBeVisible();
      await expect(page.getByText('Check-in ok', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('status')).toHaveCount(0);

      checkin.release();
      await expect(page.getByText('Check-in ok', { exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('dashboard-ready.png'), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    } finally {
      wods.release();
      checkin.release();
    }
  });
}

test('athlete can leave the dashboard while its requests are still pending', async ({ page }) => {
  const pending = gate();
  await mock(page, async (route, path) => {
    if (path === '/api/wods' || path === '/api/checkins/today') {
      await pending.promise;
      await route.abort();
      return true;
    }
    return false;
  });
  try {
    await page.goto('/');
    await page.getByRole('link', { name: 'HYROX', exact: true }).click();
    await expect(page).toHaveURL('/hyrox');
    await expect(page.getByRole('heading', { name: 'HYROX', exact: true })).toBeVisible();
  } finally {
    pending.release();
  }
});

test('failed WOD request can be retried without hiding navigation or calendar', async ({
  page,
}) => {
  let requests = 0;
  let fail = true;
  await mock(page, async (route, path) => {
    if (path !== '/api/wods') return false;
    requests++;
    await route.fulfill(
      fail ? { status: 500, json: { error: 'Unavailable' } } : { json: { wods: [] } },
    );
    return true;
  });
  await page.goto('/');
  await expect(
    page.getByText('Não foi possível carregar seus WODs.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'CrossFit', exact: true })).toBeVisible();
  await expect(page.getByText('0 de 7 dias com resultado nesta semana')).toBeVisible();
  await expect(page.getByText("Wod's Realizados", { exact: true })).toHaveCount(0);
  const requestsBeforeRetry = requests;
  fail = false;
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Enviar WOD', exact: true })).toBeVisible();
  await expect(page.getByText('Não foi possível carregar seus WODs.', { exact: true })).toHaveCount(
    0,
  );
  expect(requests).toBe(requestsBeforeRetry + 1);
});
