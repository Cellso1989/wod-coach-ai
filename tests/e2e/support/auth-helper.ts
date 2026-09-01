import type { Page } from "@playwright/test";
import { LoginPage } from "../pages/login.page.js";
import { makeTestUser, registerTestUser, type TestUser } from "./test-user.js";

/**
 * Registers a fresh athlete directly via the API (fast, isolated) and
 * logs them in through the real UI login flow, leaving `page` on the
 * dashboard. Use in tests that need an authenticated session but aren't
 * themselves testing registration/login.
 */
export async function loginAsNewUser(page: Page): Promise<TestUser> {
  const user = makeTestUser();
  await registerTestUser(user);

  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login(user.email, user.password);
  await page.waitForURL("/");

  return user;
}
