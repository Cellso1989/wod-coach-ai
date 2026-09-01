import type { Page } from "@playwright/test";

export class SubmitWodPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/wods/new");
  }

  async fillText(rawText: string, name?: string) {
    if (name) {
      await this.page.getByPlaceholder("Nome do treino (opcional)").fill(name);
    }
    await this.page.getByPlaceholder(/Cole aqui o WOD/).fill(rawText);
  }

  async submit() {
    await this.page.getByRole("button", { name: /Enviar WOD/ }).click();
  }

  errorMessage() {
    return this.page.getByText(/Cole o texto do treino ou envie uma foto/);
  }
}
