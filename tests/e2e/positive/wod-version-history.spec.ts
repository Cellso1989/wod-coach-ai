import { test, expect } from '@playwright/test';
import { MOCK_ANALYSIS, MOCK_CONTEXT, MOCK_STRATEGY } from '../support/ai-mocks.js';

for (const width of [390, 1280]) {
  test(`archived versions are read-only at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let failHistory = true;
    let mode: 'full' | 'empty' | 'legacy' = 'full';
    const writes: string[] = [];
    const version = (number: number) => ({
      id: `analysis-${number}`,
      version: number,
      reason: number === 1 ? 'LEGACY' : 'AI',
      createdAt: '2026-10-05T12:00:00Z',
      sourceSnapshot: {
        rawText: `Fonte arquivada ${number}`,
        imageMimeType: 'image/png',
        imageData:
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5WQAAAAASUVORK5CYII=',
      },
      snapshot: {
        ...MOCK_ANALYSIS.analysis,
        stimulus: `Estimulo antigo ${number}`,
        roundBreakdown: [
          { roundNumber: 1, movements: [{ name: 'Movimento arquivado', reps: 12 }] },
        ],
        generationMetadata:
          number === 2
            ? {
                promptVersion: `sha256:${'a'.repeat(64)}`,
                model: 'modelo-arquivado',
                totalUsage: { totalTokens: 123 },
              }
            : undefined,
      },
    });
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      if (route.request().method() !== 'GET') writes.push(url.pathname);
      if (url.pathname.endsWith('/auth/me'))
        return route.fulfill({ json: { user: { id: 'user', name: 'Athlete' } } });
      if (url.pathname.endsWith('/versions')) {
        if (failHistory)
          return route.fulfill({ status: 500, json: { error: 'Historico indisponivel' } });
        if (mode === 'empty')
          return route.fulfill({
            json: {
              analysisVersions: [],
              strategyVersions: [],
              nextAnalysisBefore: null,
              nextStrategyBefore: null,
            },
          });
        return route.fulfill({
          json: {
            analysisVersions: url.searchParams.has('analysisBefore') ? [version(1)] : [version(2)],
            strategyVersions: [
              {
                id:
                  url.searchParams.has('strategyBefore') || mode === 'legacy'
                    ? 'strategy-1'
                    : 'strategy-2',
                version: url.searchParams.has('strategyBefore') || mode === 'legacy' ? 1 : 2,
                createdAt: '2026-10-05T12:00:00Z',
                analysisVersionId: mode === 'legacy' ? null : 'analysis-1',
                sourceSnapshot: { rawText: 'Fonte da estrategia' },
                inputSnapshot: mode === 'legacy' ? null : { profile: { name: 'Perfil arquivado' } },
                snapshot: { ...MOCK_STRATEGY.strategy, pacing: 'Ritmo arquivado' },
              },
            ],
            nextAnalysisBefore: url.searchParams.has('analysisBefore') ? null : 2,
            nextStrategyBefore:
              url.searchParams.has('strategyBefore') || mode === 'legacy' ? null : 2,
          },
        });
      }
      if (url.pathname.endsWith('/analysis'))
        return route.fulfill({
          json: { analysis: { ...MOCK_ANALYSIS.analysis, versionId: 'analysis-2' } },
        });
      if (url.pathname.endsWith('/strategy')) return route.fulfill({ json: MOCK_STRATEGY });
      if (url.pathname.endsWith('/context')) return route.fulfill({ json: MOCK_CONTEXT });
      if (url.pathname === '/api/wods/history')
        return route.fulfill({
          json: {
            wod: {
              id: 'history',
              name: 'History WOD',
              date: '2026-10-05',
              sourceType: 'TEXT',
              rawText: 'Fonte ativa',
            },
          },
        });
      return route.fulfill({ status: 404, json: { error: 'Not found' } });
    });
    await page.goto('/wods/history');
    await page.getByRole('button', { name: 'Historico de versoes' }).click();
    const dialog = page.getByRole('dialog', { name: 'Historico de versoes' });
    await expect(dialog.getByRole('alert')).toHaveText('Historico indisponivel');
    failHistory = false;
    await dialog.getByRole('button', { name: 'Atualizar historico' }).click();
    await expect(dialog.getByText('Fonte arquivada 2', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('option', { name: /Ativa/ })).toHaveCount(1);
    const image = dialog.getByAltText('Fonte arquivada do treino');
    await expect(image).toBeVisible();
    expect(await image.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(dialog.getByText('Movimento arquivado', { exact: true })).toBeVisible();
    await dialog.getByText('Dados tecnicos', { exact: true }).last().click();
    await expect(dialog.getByText(/modelo-arquivado/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Carregar versoes anteriores' }).click();
    await dialog.getByLabel('Versao', { exact: true }).selectOption('analysis-1');
    await expect(dialog.getByText('Estimulo antigo 1', { exact: true })).toBeVisible();
    await dialog.getByRole('tab', { name: 'Estrategias' }).click();
    await expect(dialog.getByText('Ritmo arquivado', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Analise vinculada: v1', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Carregar versoes anteriores' }).click();
    await dialog.getByLabel('Versao', { exact: true }).selectOption('strategy-1');
    await dialog.getByText('Contexto arquivado', { exact: true }).click();
    await expect(dialog.getByText('Perfil arquivado', { exact: true })).toBeVisible();
    await dialog.getByText('Perfil arquivado', { exact: true }).scrollIntoViewIfNeeded();
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await dialog.screenshot({ path: `output/playwright/history-context-${width}.png` });
    await dialog.evaluate((el) => {
      el.scrollTop = 0;
    });
    await dialog.screenshot({ path: `output/playwright/history-${width}.png` });
    await dialog.getByRole('tab', { name: 'Analises' }).click();
    await expect(dialog.getByText('Estimulo antigo 1', { exact: true })).toBeVisible();
    mode = 'legacy';
    await dialog.getByRole('button', { name: 'Atualizar historico' }).click();
    await dialog.getByRole('tab', { name: 'Estrategias' }).click();
    await expect(dialog.getByText('Analise vinculada nao registrada (legado)')).toBeVisible();
    await dialog.getByText('Contexto arquivado', { exact: true }).click();
    await expect(
      dialog
        .locator('details')
        .filter({ has: page.getByText('Contexto arquivado', { exact: true }) })
        .getByText('Nao registrado', { exact: true }),
    ).toBeVisible();
    mode = 'empty';
    await dialog.getByRole('button', { name: 'Atualizar historico' }).click();
    await expect(dialog.getByText('Nenhuma versao arquivada.')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText('Fonte ativa', { exact: true })).toBeVisible();
    await expect(page.getByText(MOCK_STRATEGY.strategy.pacing, { exact: true })).toBeVisible();
    expect(writes).toEqual([]);
  });
}
