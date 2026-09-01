import type { Page } from "@playwright/test";

export class WodListPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/wods");
  }

  wodLink(name: string) {
    return this.page.getByRole("link", { name: new RegExp(name) });
  }

  emptyStateMessage() {
    return this.page.getByText(/Nenhum WOD enviado ainda/);
  }
}
