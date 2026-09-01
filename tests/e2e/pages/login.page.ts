import type { Page } from "@playwright/test";

export class LoginPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/login");
  }

  async login(email: string, password: string) {
    await this.page.getByPlaceholder("Email").fill(email);
    await this.page.getByPlaceholder("Senha").fill(password);
    await this.page.getByRole("button", { name: /Entrar/ }).click();
  }

  errorMessage() {
    return this.page.getByText(/Não foi possível entrar|inválid[oa]/i);
  }
}
