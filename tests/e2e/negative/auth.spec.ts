import { test, expect } from "@playwright/test";
import { LoginPage } from "../pages/login.page.js";
import { RegisterPage } from "../pages/register.page.js";
import { makeTestUser, registerTestUser } from "../support/test-user.js";

test("login com senha errada mostra erro e não navega", async ({ page }) => {
  const user = makeTestUser();
  await registerTestUser(user);

  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login(user.email, "senha-errada-123");

  await expect(loginPage.errorMessage()).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("cadastro com email já usado mostra erro", async ({ page }) => {
  const user = makeTestUser();
  await registerTestUser(user);

  const registerPage = new RegisterPage(page);
  await registerPage.goto();
  await registerPage.register("Outro Nome", user.email, "outrasenha123");

  await expect(registerPage.errorMessage()).toBeVisible();
  await expect(page).toHaveURL(/\/register/);
});
