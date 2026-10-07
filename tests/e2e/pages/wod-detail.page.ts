import type { Page } from '@playwright/test';

export class WodDetailPage {
  constructor(private readonly page: Page) {}

  async goto(wodId: string) {
    await this.page.goto(`/wods/${wodId}`);
  }

  async analyze() {
    await this.page.getByRole('button', { name: /Analisar treino/ }).click();
  }

  async generateStrategy() {
    await this.page
      .getByRole('button', { name: 'Gerar estrategia para hoje', exact: true })
      .click();
  }

  async fillResult(score: string) {
    await this.page.getByPlaceholder(/Resultado \(ex:/).fill(score);
    await this.page.getByRole('button', { name: /Salvar resultado/ }).click();
  }

  notFoundMessage() {
    return this.page.getByText(/WOD não encontrado|Erro ao carregar/i);
  }
}
