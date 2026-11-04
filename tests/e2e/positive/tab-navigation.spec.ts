import { test, expect, type Page } from '@playwright/test';

test.use({ reducedMotion: 'reduce' });
const user = { id: 'athlete', name: 'Atleta', accessStatus: 'APPROVED', isAdmin: true };
const wod = {
  id: 'today',
  name: 'Treino salvo',
  date: '2026-11-03T15:00:00Z',
  rawText: '10 burpees',
  sourceType: 'TEXT',
  result: { score: 'Cap +1' },
};
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((done) => {
    release = done;
  });
  return { promise, release };
}

async function mock(
  page: Page,
  intercept: (path: string, method: string) => Promise<unknown | undefined>,
) {
  await page.clock.setFixedTime(new Date('2026-11-03T18:00:00Z'));
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body = await intercept(path, route.request().method());
    if (body === undefined) {
      if (path === '/api/auth/me') body = { user };
      else if (path === '/api/wods') body = { wods: [wod] };
      else if (path === '/api/athlete-profile') body = { profile: {} };
      else if (path === '/api/notifications')
        body = { enabled: false, notifications: [], unreadCount: 0 };
      else if (path === '/api/notifications/push-config') body = { publicKey: null };
      else if (path === '/api/stats/training-calendar') body = { entries: [] };
      else if (path === '/api/checkins/today') body = { checkin: null };
    }
    await route
      .fulfill({ status: body === undefined ? 404 : 200, json: body ?? {} })
      .catch(() => {});
  });
}

for (const width of [390, 1280]) {
  test(`returning to tabs reuses recent data and notification reads at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    let lists = 0;
    let notices = 0;
    const pending = gate();
    await mock(page, async (path) => {
      if (path === '/api/wods') {
        lists++;
        if (lists > 1) await pending.promise;
        return { wods: [wod] };
      }
      if (path === '/api/notifications') {
        notices++;
        return { enabled: false, notifications: [], unreadCount: 0 };
      }
    });
    try {
      await page.goto('/wods');
      await expect(page.getByText('Treino salvo', { exact: true })).toBeVisible();
      await page.getByRole('link', { name: 'Perfil', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Salvar perfil', exact: true })).toBeVisible();
      await page.getByRole('link', { name: 'CrossFit', exact: true }).click();
      await expect(page.getByText('Treino salvo', { exact: true })).toBeVisible();
      expect(lists).toBe(1);
      expect(notices).toBe(1);
    } finally {
      pending.release();
    }
  });
}

test('saving a profile invalidates recent data before the next navigation', async ({ page }) => {
  let saved = false;
  await mock(page, async (path, method) => {
    if (path === '/api/athlete-profile' && method === 'PUT') {
      saved = true;
      return { profile: {} };
    }
    if (path === '/api/wods')
      return { wods: [{ ...wod, name: saved ? 'Treino atualizado' : 'Treino salvo' }] };
  });
  await page.goto('/wods');
  await expect(page.getByText('Treino salvo', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Perfil', exact: true }).click();
  await page.getByRole('button', { name: 'Salvar perfil', exact: true }).click();
  await expect(page.getByText('Perfil salvo.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'CrossFit', exact: true }).click();
  await expect(page.getByText('Treino atualizado', { exact: true })).toBeVisible();
  await expect(page.getByText('Treino salvo', { exact: true })).toHaveCount(0);
});

test('returning focus discards recently read data from another device', async ({ page }) => {
  let changed = false;
  await mock(page, async (path) => {
    if (path === '/api/wods')
      return { wods: [{ ...wod, name: changed ? 'Alterado em outro dispositivo' : wod.name }] };
  });
  await page.goto('/wods');
  await expect(page.getByText(wod.name, { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Perfil', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Salvar perfil', exact: true })).toBeVisible();
  changed = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.getByRole('link', { name: 'CrossFit', exact: true }).click();
  await expect(page.getByText('Alterado em outro dispositivo', { exact: true })).toBeVisible();
});

test('a late session read cannot restore the previous account after login', async ({ page }) => {
  const oldSession = gate();
  const nextUser = { ...user, id: 'new-account', name: 'Conta nova' };
  await mock(page, async (path) => {
    if (path === '/api/auth/me') {
      await oldSession.promise;
      return { user: { ...user, name: 'Conta antiga' } };
    }
    if (path === '/api/auth/login') return { user: nextUser };
  });
  try {
    await page.goto('/login');
    await page.getByPlaceholder('Email', { exact: true }).fill('fixture@example.com');
    await page.getByPlaceholder('Senha', { exact: true }).fill('fictional-password');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByText('Ola, Conta nova', { exact: true })).toBeVisible();
    const oldResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/auth/me',
    );
    oldSession.release();
    await oldResponse;
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(page.getByText('Ola, Conta nova', { exact: true })).toBeVisible();
    await expect(page.getByText('Ola, Conta antiga', { exact: true })).toHaveCount(0);
  } finally {
    oldSession.release();
  }
});

test('a changed account discards the previous page state while new private data loads', async ({
  page,
}) => {
  const pending = gate();
  let changed = false;
  let newReads = 0;
  await mock(page, async (path) => {
    if (path === '/api/auth/me') return { user: changed ? { ...user, id: 'other-account' } : user };
    if (path === '/api/wods' && changed) {
      newReads++;
      await pending.promise;
      return { wods: [{ ...wod, id: 'other', name: 'Treino da outra conta' }] };
    }
  });
  try {
    await page.goto('/wods');
    await expect(page.getByText(wod.name, { exact: true })).toBeVisible();
    changed = true;
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect.poll(() => newReads).toBeGreaterThan(0);
    await expect(page.getByText(wod.name, { exact: true })).toHaveCount(0);
    pending.release();
    await expect(page.getByText('Treino da outra conta', { exact: true })).toBeVisible();
  } finally {
    pending.release();
  }
});

for (const [label, path, endpoint] of [
  ['Perfil', '/profile', '/api/athlete-profile'],
  ['Admin', '/admin', '/api/admin/users'],
]) {
  test(`navigation remains usable while ${label} is pending`, async ({ page }) => {
    const pending = gate();
    await mock(page, async (target) => {
      if (target === endpoint) {
        await pending.promise;
        return {};
      }
    });
    try {
      await page.goto(path!);
      await expect(page.getByRole('link', { name: 'CrossFit', exact: true })).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: 'Carregando' })).toBeVisible();
      await page.getByRole('link', { name: 'CrossFit', exact: true }).click();
      await expect(page.getByText('Treino salvo', { exact: true })).toBeVisible();
    } finally {
      pending.release();
    }
  });
}
