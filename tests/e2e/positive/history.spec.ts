import { test, expect } from "@playwright/test";
import { SubmitWodPage } from "../pages/submit-wod.page.js";
import { WodListPage } from "../pages/wod-list.page.js";
import { loginAsNewUser } from "../support/auth-helper.js";

test("atleta consegue visualizar o histórico de WODs enviados", async ({ page }) => {
  await loginAsNewUser(page);

  const submitWodPage = new SubmitWodPage(page);
  await submitWodPage.goto();
  await submitWodPage.fillText("EMOM 10\n5 Burpees", "WOD do histórico");
  await submitWodPage.submit();
  await page.waitForURL(/\/wods\/[^/]+$/);

  const wodListPage = new WodListPage(page);
  await wodListPage.goto();

  await expect(wodListPage.wodLink("WOD do histórico")).toBeVisible();
});
