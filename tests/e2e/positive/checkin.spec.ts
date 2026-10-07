import { test, expect } from '@playwright/test';
import { CheckinPage } from '../pages/checkin.page.js';
import { loginAsNewUser } from '../support/auth-helper.js';

test('atleta registra resultado do dia e o recupera apos recarga', async ({ page }) => {
  await loginAsNewUser(page);

  const checkinPage = new CheckinPage(page);
  await checkinPage.goto();
  await page.getByPlaceholder('ex: 12:34').fill('12:34');
  await page.getByPlaceholder('0', { exact: true }).nth(0).fill('3');
  await page.getByPlaceholder('0', { exact: true }).nth(1).fill('8');
  await checkinPage.submit();
  await page.waitForURL(/\/$/);
  await checkinPage.goto();
  await expect(page.getByPlaceholder('ex: 12:34')).toHaveValue('12:34');
  await expect(page.getByPlaceholder('0', { exact: true }).nth(0)).toHaveValue('3');
  await expect(page.getByPlaceholder('0', { exact: true }).nth(1)).toHaveValue('8');
});
