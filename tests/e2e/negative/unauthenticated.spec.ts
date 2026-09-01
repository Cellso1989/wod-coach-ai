import { test, expect } from "@playwright/test";

test("usuário não autenticado é redirecionado para /login ao acessar uma rota protegida", async ({
  page,
}) => {
  await page.goto("/checkin");
  await expect(page).toHaveURL(/\/login/);
});

test("usuário não autenticado é redirecionado para /login ao acessar o histórico de WODs", async ({
  page,
}) => {
  await page.goto("/wods");
  await expect(page).toHaveURL(/\/login/);
});
