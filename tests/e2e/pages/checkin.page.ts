import type { Page } from "@playwright/test";

export class CheckinPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/checkin");
  }

  /** Submits the check-in using the sliders' default values. */
  async submit() {
    await this.page.getByRole("button", { name: /Salvar check-in/ }).click();
  }

  readinessScore() {
    return this.page.getByText(/Readiness Score/).locator("..").locator("p.text-4xl");
  }
}
