import { test, expect } from '@playwright/test';
import { MOCK_ANALYSIS } from '../support/ai-mocks.js';

for (const width of [390, 1280]) {
  test(`result feedback follows successful saves and CAP results at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    let result: { id: string; score: string } | null = null;
    let failSave = false;
    let releaseSave!: () => void;
    const pendingSave = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/auth/me')
        return route.fulfill({ json: { user: { id: 'athlete', name: 'Atleta' } } });
      if (path === '/api/wods/result-feedback')
        return route.fulfill({
          json: {
            wod: {
              id: 'result-feedback',
              name: 'Treino',
              date: '2026-10-16',
              rawText: '4 rounds for time. Target 10 min. Time cap 14 min.',
              result,
            },
          },
        });
      if (path.endsWith('/analysis'))
        return route.fulfill({
          json: {
            analysis: {
              ...MOCK_ANALYSIS.analysis,
              format: 'ROUNDS_FOR_TIME',
              durationMinutes: 14,
              rawResponse: { targetMinutes: 10 },
            },
          },
        });
      if (path.endsWith('/result')) {
        await pendingSave;
        if (failSave)
          return route.fulfill({ status: 500, json: { error: 'Falha ao salvar resultado.' } });
        result = { id: 'saved-result', score: route.request().postDataJSON().score.trim() };
        return route.fulfill({ json: { result } });
      }
      return route.fulfill({ status: 404, json: { error: 'Nao encontrado' } });
    });

    await page.goto('/wods/result-feedback');
    const scoreInput = page.getByPlaceholder(/Resultado \(ex:/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await scoreInput.fill('12:34');
    await page.getByRole('button', { name: 'Salvar resultado', exact: true }).click();
    try {
      await expect(page.getByRole('button', { name: 'Salvando...', exact: true })).toBeDisabled();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    } finally {
      releaseSave();
    }
    const success = page.getByRole('dialog', { name: 'Boa meu Atleta, finalizou', exact: true });
    await expect(success).toBeVisible();
    const bounds = await success.boundingBox();
    expect(bounds).not.toBeNull();
    expect(Math.abs(bounds!.y + bounds!.height / 2 - 450)).toBeLessThan(2);
    await success.screenshot({ path: testInfo.outputPath('result-finished.png') });
    await success.getByRole('button', { name: 'Fechar', exact: true }).click();
    await expect(success).toHaveCount(0);
    await expect(page.getByText('12:34', { exact: true })).toBeVisible();

    for (const score of ['CAP 10', 'cap25', '14:01', '14:00']) {
      await page.getByRole('button', { name: 'Editar resultado', exact: true }).click();
      await scoreInput.fill(score);
      await page.getByRole('button', { name: 'Atualizar resultado', exact: true }).click();
      const feedback = page.getByRole('dialog', {
        name: score === '14:00' ? 'Boa meu Atleta, finalizou' : 'Se esforce mais viu',
        exact: true,
      });
      await expect(feedback).toBeVisible();
      if (score === 'CAP 10')
        await feedback.screenshot({ path: testInfo.outputPath('result-cap.png') });
      await feedback.press('Escape');
      await expect(feedback).toHaveCount(0);
    }

    failSave = true;
    await page.getByRole('button', { name: 'Editar resultado', exact: true }).click();
    await scoreInput.fill('CAP 30');
    await page.getByRole('button', { name: 'Atualizar resultado', exact: true }).click();
    await expect(page.getByText('Falha ao salvar resultado.', { exact: true })).toBeVisible();
    await expect(scoreInput).toHaveValue('CAP 30');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.reload();
    await expect(page.getByText('14:00', { exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
}
