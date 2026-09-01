import { test, expect } from "@playwright/test";
import { SubmitWodPage } from "../pages/submit-wod.page.js";
import { WodDetailPage } from "../pages/wod-detail.page.js";
import { loginAsNewUser } from "../support/auth-helper.js";
import { mockAiRoutes } from "../support/ai-mocks.js";

test("fluxo completo: enviar WOD, analisar, gerar estratégia, registrar resultado e feedback", async ({
  page,
}) => {
  await loginAsNewUser(page);
  await mockAiRoutes(page);

  const submitWodPage = new SubmitWodPage(page);
  await submitWodPage.goto();
  await submitWodPage.fillText("15 min AMRAP\n10 Toes to Bar\n15 Wall Balls\n200m Run", "Meu WOD");
  await submitWodPage.submit();

  // A submissão redireciona para /wods/:id
  await page.waitForURL(/\/wods\/[^/]+$/);

  const wodDetailPage = new WodDetailPage(page);
  await wodDetailPage.analyze();
  await expect(page.getByText("AMRAP", { exact: true })).toBeVisible();
  await expect(page.getByText(/Toes to Bar/).first()).toBeVisible();

  await wodDetailPage.generateStrategy();
  await expect(page.getByText(/Intensidade/)).toBeVisible();
  await expect(page.getByText(/Grip/).first()).toBeVisible();

  await wodDetailPage.fillResult("8 rounds + 5 reps");
  await expect(page.getByText("8 rounds + 5 reps")).toBeVisible();

  await wodDetailPage.fillFeedbackWhereItBroke("Toes to Bar na 4a rodada");
  await expect(page.getByText(/Onde quebrou: Toes to Bar na 4a rodada/)).toBeVisible();
  await expect(page.getByText(/vai ajudar a calibrar a estratégia/)).toBeVisible();
});
