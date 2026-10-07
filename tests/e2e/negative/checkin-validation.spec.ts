import { test, expect } from '@playwright/test';
import { makeTestUser, registerTestUser } from '../support/test-user.js';
import { loginAsNewUser } from '../support/auth-helper.js';

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3333';

test('a API rejeita resultados invalidos sem persistir', async ({ request }) => {
  const user = makeTestUser();
  await registerTestUser(user);

  const loginResponse = await request.post(`${API_URL}/api/auth/login`, {
    data: { email: user.email, password: user.password },
  });
  expect(loginResponse.ok()).toBe(true);

  for (const data of [
    { timeSeconds: -1 },
    { timeSeconds: 1.5 },
    { timeSeconds: 2147483648 },
    { rounds: -1 },
    { reps: 1.5 },
    { weightKg: 401 },
  ]) {
    expect((await request.post(`${API_URL}/api/checkins`, { data })).status()).toBe(400);
  }
  expect((await request.get(`${API_URL}/api/checkins/today`)).status()).toBe(404);
});

test('a API aceita resultado vazio porque todos os campos sao opcionais', async ({ request }) => {
  const user = makeTestUser();
  await registerTestUser(user);

  const loginResponse = await request.post(`${API_URL}/api/auth/login`, {
    data: { email: user.email, password: user.password },
  });
  expect(loginResponse.ok()).toBe(true);

  const response = await request.post(`${API_URL}/api/checkins`, {
    data: {},
  });

  expect(response.status()).toBe(201);
  expect((await request.get(`${API_URL}/api/checkins/today`)).status()).toBe(200);
});

test('tempo invalido na UI nao dispara POST nem altera o resultado salvo', async ({ page }) => {
  await loginAsNewUser(page);
  await page.goto('/checkin');
  await page.getByPlaceholder('ex: 12:34').fill('12:34');
  await page.getByRole('button', { name: 'Salvar check-in' }).click();
  await page.waitForURL(/\/$/);
  let posts = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/api/checkins')) posts++;
  });
  await page.goto('/checkin');
  await expect(page.getByPlaceholder('ex: 12:34')).toHaveValue('12:34');
  for (const value of ['12:99', '0:60', '12:34:56', '-1', '1.5', 'abc']) {
    await page.getByPlaceholder('ex: 12:34').fill(value);
    await page.getByRole('button', { name: 'Salvar check-in' }).click();
    await expect(page.getByText(/Informe um tempo valido em mm:ss/)).toBeVisible();
    await expect(page).toHaveURL(/\/checkin$/);
  }
  expect(posts).toBe(0);
  await page.reload();
  await expect(page.getByPlaceholder('ex: 12:34')).toHaveValue('12:34');
});
