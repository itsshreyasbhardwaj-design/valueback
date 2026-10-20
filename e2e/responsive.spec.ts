import { expect, test } from '@playwright/test';
import { addBenefit, isoInDays, registerAndSkip } from './helpers';

/** Runs under the mobile-chromium project (Pixel 7, 412×915). */
test.describe('small screens', () => {
  test('the app is usable and does not scroll sideways', async ({ page }) => {
    await registerAndSkip(page, 'mobile');
    await addBenefit(page, { title: 'Mobile credit', merchant: 'Lifestyle', value: '1250', expiresAt: isoInDays(20) });

    for (const path of ['/app', '/app/benefits', '/app/refunds', '/app/analytics', '/app/settings']) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} should not scroll horizontally`).toBeLessThanOrEqual(1);
    }
  });

  test('the bottom tab bar and the add action are reachable', async ({ page }) => {
    await registerAndSkip(page, 'mobilenav');
    await page.goto('/app');

    const tabs = page.getByRole('navigation', { name: 'Primary' });
    await expect(tabs).toBeVisible();
    await expect(tabs.getByRole('link', { name: 'Add' })).toBeVisible();

    await tabs.getByRole('link', { name: 'Benefits' }).click();
    await expect(page).toHaveURL(/\/app\/benefits/);

    await tabs.getByRole('link', { name: 'Add' }).click();
    await expect(page).toHaveURL(/\/app\/benefits\/new/);
  });

  test('the compact menu opens and closes on navigation', async ({ page }) => {
    await registerAndSkip(page, 'mobilemenu');
    await page.goto('/app');

    await page.getByRole('button', { name: 'Open menu' }).click();
    const menu = page.locator('#mobile-menu');
    await expect(menu).toBeVisible();

    await menu.getByRole('link', { name: 'Analytics' }).click();
    await expect(page).toHaveURL(/\/app\/analytics/);
    await expect(page.locator('#mobile-menu')).toHaveCount(0);
  });

  test('the marketing home page fits a phone', async ({ page }) => {
    await page.goto('/');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /Start tracking for free/i }).first()).toBeVisible();
  });

  test('a form is filled and submitted with touch-sized controls', async ({ page }) => {
    await registerAndSkip(page, 'mobileform');
    await page.goto('/app/benefits/new');

    const save = page.getByRole('button', { name: 'Save benefit' });
    const box = (await save.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(36);

    await page.locator('#title').fill('Added on a phone');
    await page.locator('#originalValue').fill('300');
    await save.click();
    await expect(page).toHaveURL(/\/app\/benefits\/b_/);
    await expect(page.getByRole('heading', { name: 'Added on a phone' })).toBeVisible();
  });
});
