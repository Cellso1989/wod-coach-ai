import type { Page } from '@playwright/test';

export class CheckinPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/checkin');
  }

  /** Saves the current optional result fields. */
  async submit() {
    await this.page.getByRole('button', { name: /Salvar check-in/ }).click();
  }
}
