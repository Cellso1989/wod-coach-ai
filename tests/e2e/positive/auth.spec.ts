import { test, expect } from '@playwright/test';
import { RegisterPage } from '../pages/register.page.js';
import { LoginPage } from '../pages/login.page.js';
import { makeTestUser, registerTestUser } from '../support/test-user.js';

test('um novo atleta solicita cadastro e aguarda aprovação sem entrar', async ({ page }) => {
  const user = makeTestUser();
  const registerPage = new RegisterPage(page);

  await registerPage.goto();
  await registerPage.register(user.name, user.email, user.password);

  await expect(page.getByRole('heading', { name: 'Cadastro recebido' })).toBeVisible();
  await expect(page.getByText(/Aguarde a aprovação/)).toBeVisible();
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/login/);
});

test('um atleta já cadastrado consegue fazer login', async ({ page }) => {
  const user = makeTestUser();
  await registerTestUser(user);

  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login(user.email, user.password);

  await page.waitForURL('/');
  await expect(page.getByText(/WOD Coach AI/)).toBeVisible();
});
