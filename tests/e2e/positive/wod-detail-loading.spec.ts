import { test, expect, type Page, type Route } from '@playwright/test';
import { MOCK_ANALYSIS, MOCK_CONTEXT, MOCK_STRATEGY } from '../support/ai-mocks.js';

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function mock(
  page: Page,
  intercept: (route: Route, id: string, resource: string) => Promise<boolean>,
) {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me')
      return route.fulfill({ json: { user: { id: 'user', name: 'Athlete' } } });
    const [, id = '', resource = ''] = path.match(/^\/api\/wods\/([^/]+)(?:\/([^/]+))?$/) ?? [];
    if (await intercept(route, id, resource)) return;
    if (!resource)
      return route.fulfill({
        json: {
          wod: {
            id,
            name: `WOD ${id}`,
            date: '2026-10-05',
            sourceType: 'TEXT',
            rawText: `Fonte ${id}`,
            result: { score: '8 rounds' },
          },
        },
      });
    if (resource === 'analysis')
      return route.fulfill({
        json: { analysis: { ...MOCK_ANALYSIS.analysis, stimulus: `Estimulo ${id}` } },
      });
    if (resource === 'strategy')
      return route.fulfill({
        json: { strategy: { ...MOCK_STRATEGY.strategy, pacing: `Ritmo ${id}` } },
      });
    return route.fulfill({ status: 404, json: { error: 'Not found' } });
  });
}

async function navigate(page: Page, id: string) {
  await page.evaluate((id) => {
    window.history.pushState(null, '', `/wods/${id}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, id);
}

for (const { resource, status } of [
  { resource: 'analysis', status: 500 },
  { resource: 'strategy', status: 401 },
  { resource: 'strategy', status: 0 },
  { resource: 'source', status: 404 },
]) {
  test(`a failed ${resource} read (${status || 'network'}) is not absence and can be retried`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: resource === 'analysis' ? 390 : 1280, height: 900 });
    let failed = true;
    const writes: string[] = [];
    await mock(page, async (route, _id, path) => {
      if (route.request().method() !== 'GET') writes.push(path);
      if (path === (resource === 'source' ? '' : resource) && failed) {
        if (status === 0) await route.abort('failed');
        else await route.fulfill({ status, json: { error: 'Falha de leitura' } });
        return true;
      }
      return false;
    });
    await page.goto('/wods/a');
    await expect(page.getByRole('alert')).toContainText(
      status === 0 ? 'Falha de conexao.' : 'Falha de leitura',
      { timeout: 5000 },
    );
    const analyze = page.getByRole('button', { name: /^(Reanalisar|Analisar) treino$/ });
    if (resource === 'source') await expect(analyze).toHaveCount(0);
    else await expect(analyze).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Gerar estrategia para hoje' })).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: `output/playwright/detail-loading-${resource}-${status}.png`,
      fullPage: true,
    });
    failed = false;
    await page.getByRole('button', { name: 'Tentar carregar novamente' }).click();
    await expect(page.getByText('Estimulo a', { exact: false })).toBeVisible();
    await expect(page.getByText('Ritmo a', { exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(writes).toEqual([]);
  });
}

for (const heldResource of ['analysis', 'strategy']) {
  test(`pending ${heldResource} read does not allow generating over an unknown active version`, async ({
    page,
  }) => {
    const pending = gate();
    await mock(page, async (route, _id, resource) => {
      if (resource !== heldResource) return false;
      await pending.promise;
      await route.fulfill({ json: heldResource === 'analysis' ? MOCK_ANALYSIS : MOCK_STRATEGY });
      return true;
    });
    try {
      await page.goto('/wods/a');
      await expect(page.getByRole('status').filter({ hasText: 'Carregando' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Analisar treino', exact: true })).toHaveCount(
        0,
      );
      pending.release();
      await expect(
        page.getByRole('button', { name: 'Reanalisar treino', exact: true }),
      ).toBeEnabled();
    } finally {
      pending.release();
    }
  });
}

test('late reads from a previous route do not replace the current WOD', async ({ page }) => {
  const pending = gate();
  const finished = gate();
  let requested = false;
  await mock(page, async (route, id, resource) => {
    if (id !== 'a' || resource !== 'analysis') return false;
    requested = true;
    await pending.promise;
    await route
      .fulfill({
        json: { analysis: { ...MOCK_ANALYSIS.analysis, stimulus: 'Analise antiga atrasada' } },
      })
      .catch(() => {});
    finished.release();
    return true;
  });
  try {
    await page.goto('/wods/a');
    await expect.poll(() => requested).toBe(true);
    await navigate(page, 'b');
    await expect(page.getByText('Fonte b', { exact: true })).toBeVisible();
    pending.release();
    await finished.promise;
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(page.getByText('Estimulo b', { exact: false })).toBeVisible();
    await expect(page.getByText('Analise antiga atrasada', { exact: false })).toHaveCount(0);
    await expect(page.getByText('Ritmo b', { exact: true })).toBeVisible();
  } finally {
    pending.release();
  }
});

test('leaving during analysis does not start strategy generation for the old route', async ({
  page,
}) => {
  const pending = gate();
  const started = gate();
  let strategyWrites = 0;
  await mock(page, async (route, _id, resource) => {
    if (resource === 'analyze') {
      started.release();
      await pending.promise;
      await route.fulfill({ json: { ...MOCK_ANALYSIS, wod: null } });
      return true;
    }
    if (resource === 'strategy' && route.request().method() === 'POST') strategyWrites++;
    return false;
  });
  try {
    await page.goto('/wods/a');
    await page.getByRole('button', { name: 'Reanalisar treino', exact: true }).click();
    await started.promise;
    await navigate(page, 'b');
    await expect(page.getByText('Fonte b', { exact: true })).toBeVisible();
    const response = page.waitForResponse((r) => r.url().endsWith('/wods/a/analyze'));
    pending.release();
    await response;
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(
      page.getByRole('button', { name: 'Reanalisar treino', exact: true }),
    ).toBeEnabled();
    await expect(page.getByText('Ritmo b', { exact: true })).toBeVisible();
    expect(strategyWrites).toBe(0);
  } finally {
    pending.release();
  }
});

for (const operation of ['text', 'duration', 'delete']) {
  test(`leaving during ${operation} mutation preserves the destination state`, async ({ page }) => {
    const pending = gate();
    const started = gate();
    const method = operation === 'delete' ? 'DELETE' : operation === 'text' ? 'PUT' : 'PATCH';
    const suffix = operation === 'duration' ? '/analysis' : '';
    await mock(page, async (route, id, resource) => {
      if (id !== 'a' || route.request().method() !== method) return false;
      started.release();
      await pending.promise;
      if (resource === 'analysis')
        await route.fulfill({
          json: { analysis: { ...MOCK_ANALYSIS.analysis, durationMinutes: 20 } },
        });
      else if (operation === 'delete') await route.fulfill({ status: 204 });
      else await route.fulfill({ json: { wod: { id: 'a', rawText: 'Texto editado em A' } } });
      return true;
    });
    try {
      await page.goto('/wods/a');
      await expect(page.getByText('Fonte a', { exact: true })).toBeVisible();
      if (operation === 'text') {
        await page.getByRole('button', { name: 'Editar', exact: true }).click();
        await page.locator('textarea').fill('Texto editado em A');
        await page.getByRole('button', { name: 'Salvar', exact: true }).click();
      } else if (operation === 'duration') {
        await page.getByRole('button', { name: /15 min/ }).click();
        await page.getByRole('spinbutton').fill('20');
        await page.getByRole('button', { name: 'Salvar', exact: true }).click();
      } else {
        page.once('dialog', (dialog) => void dialog.accept());
        await page.getByRole('button', { name: 'Apagar', exact: true }).click();
      }
      await started.promise;
      await navigate(page, 'b');
      await expect(page.getByText('Fonte b', { exact: true })).toBeVisible();
      const response = page.waitForResponse(
        (r) => r.url().endsWith(`/wods/a${suffix}`) && r.request().method() === method,
      );
      pending.release();
      await response;
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await expect(page).toHaveURL(/\/wods\/b$/);
      await expect(page.getByText('Fonte b', { exact: true })).toBeVisible();
      await expect(page.getByText('Estimulo b', { exact: false })).toBeVisible();
      await expect(page.getByText('Ritmo b', { exact: true })).toBeVisible();
      await expect(page.getByText('8 rounds', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: /15 min/ })).toBeVisible();
    } finally {
      pending.release();
    }
  });
}

test('manual generation locks conflicting actions and cannot update another route', async ({
  page,
}) => {
  const pending = gate();
  const started = gate();
  await mock(page, async (route, id, resource) => {
    if (id !== 'a' || resource !== 'strategy') return false;
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 404, json: { error: 'No strategy' } });
    } else {
      started.release();
      await pending.promise;
      await route.fulfill({
        json: { strategy: { ...MOCK_STRATEGY.strategy, pacing: 'Geracao manual de A' } },
      });
    }
    return true;
  });
  try {
    await page.goto('/wods/a');
    await page.getByRole('button', { name: 'Gerar estrategia para hoje', exact: true }).click();
    await started.promise;
    await expect(
      page.getByRole('button', { name: 'Reanalisar treino', exact: true }),
    ).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Editar', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: /15 min/ })).toBeDisabled();
    await navigate(page, 'b');
    await expect(page.getByText('Fonte b', { exact: true })).toBeVisible();
    const response = page.waitForResponse(
      (r) => r.url().endsWith('/wods/a/strategy') && r.request().method() === 'POST',
    );
    pending.release();
    await response;
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(page.getByText('Ritmo b', { exact: true })).toBeVisible();
    await expect(page.getByText('Geracao manual de A', { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Reanalisar treino', exact: true }),
    ).toBeEnabled();
  } finally {
    pending.release();
  }
});

test('reanalysis resets the previously displayed athlete context', async ({ page }) => {
  let reanalyzed = false;
  await mock(page, async (route, _id, resource) => {
    if (resource === 'analyze') {
      reanalyzed = true;
      await route.fulfill({ json: { ...MOCK_ANALYSIS, wod: null } });
      return true;
    }
    if (resource === 'context') {
      await route.fulfill({
        json: {
          context: {
            ...MOCK_CONTEXT.context,
            relevantPersonalRecords: [
              {
                movementName: 'Back Squat',
                value: reanalyzed ? 150 : 100,
                unit: 'kg',
                achievedAt: '2026-10-05',
              },
            ],
          },
        },
      });
      return true;
    }
    return false;
  });
  await page.goto('/wods/a');
  await page.getByRole('button', { name: /Ver meu/ }).click();
  await expect(page.getByText('Back Squat: 100 kg', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reanalisar treino', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reanalisar treino', exact: true })).toBeEnabled();
  await expect(page.getByText('Back Squat: 100 kg', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /Ver meu/ }).click();
  await expect(page.getByText('Back Squat: 150 kg', { exact: true })).toBeVisible();
  await expect(page.getByText('Fonte a', { exact: true })).toBeVisible();
  await expect(page.getByText('8 rounds', { exact: true })).toBeVisible();
});
