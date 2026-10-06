import { test, expect } from '@playwright/test';

for (const width of [390, 1280]) {
  test(`classifies PRs without inferring 1RM for legacy records at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const records = [
      {
        id: 'legacy',
        movementName: 'Back Squat',
        value: 100,
        unit: 'kg',
        notes: null,
        achievedAt: '2026-09-01',
        recordType: 'UNKNOWN',
        repetitions: null,
      },
      {
        id: 'five',
        movementName: 'Back Squat',
        value: 100,
        unit: 'kg',
        notes: null,
        achievedAt: '2026-09-02',
        recordType: 'REP_MAX',
        repetitions: 5,
      },
    ];
    const payloads: Record<string, unknown>[] = [];
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/auth/me'))
        return route.fulfill({ json: { user: { id: 'test', name: 'Athlete' } } });
      if (url.pathname === '/api/personal-records' && route.request().method() === 'GET')
        return route.fulfill({ json: { records } });
      if (
        url.pathname.startsWith('/api/personal-records') &&
        ['POST', 'PUT'].includes(route.request().method())
      ) {
        const body = route.request().postDataJSON();
        payloads.push(body);
        const id = route.request().method() === 'POST' ? 'new' : url.pathname.split('/').at(-1)!;
        const record = { ...body, id, notes: body.notes ?? null, achievedAt: '2026-10-05' };
        const index = records.findIndex((item) => item.id === id);
        if (index < 0) records.push(record);
        else records[index] = record;
        return route.fulfill({
          status: route.request().method() === 'POST' ? 201 : 200,
          json: { record },
        });
      }
      return route.fulfill({ json: {} });
    });
    await page.goto('/personal-records');
    await expect(page.getByText('Tipo nao informado - 100 kg')).toBeVisible();
    await expect(page.getByText('5RM - 100 kg')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ver %', exact: true })).toHaveCount(0);
    await expect(page.getByText('Evolucao dos PRs')).toHaveCount(0);
    await page
      .locator('li')
      .filter({ hasText: 'Tipo nao informado' })
      .getByRole('button', { name: 'Editar', exact: true })
      .click();
    await expect(page.getByLabel('Tipo de PR')).toHaveValue('UNKNOWN');
    await page.getByLabel('Tipo de PR').selectOption('ONE_RM');
    await page.getByRole('button', { name: 'Salvar alteracoes' }).click();
    expect(payloads.at(-1)).toMatchObject({ recordType: 'ONE_RM', repetitions: null, value: 100 });
    await page.getByRole('button', { name: 'Ver %', exact: true }).click();
    await expect(page.getByText('50 kg', { exact: true })).toBeVisible();
    await page.getByPlaceholder('Movimento (ex: Back Squat, Fran)').fill('Front Squat');
    await page.getByPlaceholder('Valor', { exact: true }).fill('80');
    await page.getByLabel('Tipo de PR').selectOption('REP_MAX');
    await page.getByLabel('Repeticoes na carga registrada').fill('5');
    await page.getByRole('button', { name: 'Adicionar PR', exact: true }).click();
    expect(payloads.at(-1)).toMatchObject({ recordType: 'REP_MAX', repetitions: 5 });
    await page.reload();
    await expect(page.getByText('5RM - 80 kg')).toBeVisible();
    await page
      .locator('li')
      .filter({ hasText: 'Front Squat' })
      .getByRole('button', { name: 'Editar', exact: true })
      .click();
    await expect(page.getByLabel('Repeticoes na carga registrada')).toHaveValue('5');
    await page.getByLabel('Unidade', { exact: true }).selectOption('reps');
    await expect(page.getByLabel('Tipo de PR')).toHaveValue('UNKNOWN');
    await expect(page.getByLabel('Repeticoes na carga registrada')).toHaveCount(0);
    await page.getByLabel('Tipo de PR').selectOption('UNBROKEN_REPS');
    await page.getByRole('button', { name: 'Salvar alteracoes' }).click();
    expect(payloads.at(-1)).toMatchObject({
      recordType: 'UNBROKEN_REPS',
      repetitions: null,
      unit: 'reps',
    });
    await expect(page.getByText('Repeticoes sem quebra - 80 reps')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ver %', exact: true })).toHaveCount(1);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('pr-classification.png'),
      fullPage: true,
    });
  });
}
