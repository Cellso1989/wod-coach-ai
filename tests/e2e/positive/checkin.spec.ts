import { test, expect } from "@playwright/test";
import { CheckinPage } from "../pages/checkin.page.js";
import { loginAsNewUser } from "../support/auth-helper.js";

test("atleta consegue registrar o check-in de hoje e ver o Readiness Score", async ({ page }) => {
  await loginAsNewUser(page);

  const checkinPage = new CheckinPage(page);
  await checkinPage.goto();
  await checkinPage.submit();

  await expect(page.getByText(/Readiness Score/)).toBeVisible();
  // O score é sempre 0-100 e calculado deterministicamente, nunca pela IA.
  await expect(page.locator("p.text-4xl.font-bold")).toBeVisible();
});
