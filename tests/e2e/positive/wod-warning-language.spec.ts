import { test, expect } from '@playwright/test';
import { MOCK_ANALYSIS } from '../support/ai-mocks.js';

for (const width of [390, 1280]) {
  test(`saved English analysis warnings are readable in Portuguese without AI at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    let writes = 0;
    await page.route('**/api/**', async (route) => {
      if (route.request().method() !== 'GET') writes++;
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/auth/me'))
        return route.fulfill({ json: { user: { id: 'user', name: 'Athlete' } } });
      if (path === '/api/wods/warnings')
        return route.fulfill({
          json: {
            wod: {
              id: 'warnings',
              date: '2026-10-07',
              rawText: '5 rounds: 12 Hang power clean',
              result: null,
            },
          },
        });
      if (path.endsWith('/analysis'))
        return route.fulfill({
          json: {
            analysis: {
              ...MOCK_ANALYSIS.analysis,
              format: 'ROUNDS_FOR_TIME',
              warnings: [
                "format assumed ROUNDS_FOR_TIME based on '5 rounds' (not explicitly stated as for time)",
                'load not specified for Hang power clean',
              ],
            },
          },
        });
      return route.fulfill({ status: 404, json: { error: 'Not found' } });
    });
    await page.goto('/wods/warnings');
    const warnings = page.getByRole('list', { name: 'Avisos da análise', exact: true });
    await expect(warnings).toContainText(
      'Entendi o treino como 5 voltas para terminar no menor tempo possivel. Confirme se esse e o formato correto.',
    );
    await expect(warnings).toContainText(
      'Falta informar a carga de Hang power clean. Preencha em Editar cargas.',
    );
    await expect(warnings).not.toContainText('ROUNDS_FOR_TIME');
    await expect(warnings).not.toContainText('not specified');
    expect(writes).toBe(0);
    expect(
      await warnings.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    ).toBe(true);
    await warnings.screenshot({ path: test.info().outputPath('portuguese-warnings.png') });
    await page.reload();
    await expect(warnings).toContainText('Entendi o treino como 5 voltas');
    expect(writes).toBe(0);
  });
}
