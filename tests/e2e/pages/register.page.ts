import type { Page } from "@playwright/test";

export class RegisterPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/register");
  }

  async register(name: string, email: string, password: string) {
    await this.page.getByPlaceholder("Nome").fill(name);
    await this.page.getByPlaceholder("Email").fill(email);
    await this.page.getByPlaceholder(/Senha/).fill(password);
    await this.page.getByRole("button", { name: /Criar conta/ }).click();
  }

  errorMessage() {
    return this.page.getByText(/Não foi possível criar a conta|already registered/i);
  }
}
