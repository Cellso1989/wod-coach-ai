import { test, expect } from "@playwright/test";
import { SubmitWodPage } from "../pages/submit-wod.page.js";
import { WodDetailPage } from "../pages/wod-detail.page.js";
import { loginAsNewUser } from "../support/auth-helper.js";

test("enviar o formulário de WOD vazio mostra erro e não navega", async ({ page }) => {
  await loginAsNewUser(page);

  const submitWodPage = new SubmitWodPage(page);
  await submitWodPage.goto();
  await submitWodPage.submit();

  await expect(submitWodPage.errorMessage()).toBeVisible();
  await expect(page).toHaveURL(/\/wods\/new/);
});

test("abrir um WOD inexistente mostra uma mensagem de erro", async ({ page }) => {
  await loginAsNewUser(page);

  const wodDetailPage = new WodDetailPage(page);
  await wodDetailPage.goto("00000000-0000-0000-0000-000000000000");

  await expect(wodDetailPage.notFoundMessage()).toBeVisible();
});

test("quando a análise de IA falha (API indisponível), a interface mostra um erro em vez de travar", async ({
  page,
}) => {
  await loginAsNewUser(page);

  const submitWodPage = new SubmitWodPage(page);
  await submitWodPage.goto();
  await submitWodPage.fillText("15 min AMRAP\n10 Burpees", "WOD com falha simulada");
  await submitWodPage.submit();
  await page.waitForURL(/\/wods\/[^/]+$/);

  await page.route("**/wods/*/analyze", (route) =>
    route.fulfill({ status: 502, json: { error: "Não foi possível analisar este WOD agora" } }),
  );

  const wodDetailPage = new WodDetailPage(page);
  await wodDetailPage.analyze();

  await expect(page.getByText(/Não foi possível analisar este WOD agora/)).toBeVisible();
});
