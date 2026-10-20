import { expect, type Page } from '@playwright/test';

let counter = 0;

export function uniqueEmail(prefix = 'e2e'): string {
  counter += 1;
  return `${prefix}.${Date.now()}.${counter}@example.test`;
}

export const PASSWORD = 'e2e-long-enough-password';

/** Registers a new account and lands on the onboarding screen. */
export async function register(page: Page, email = uniqueEmail(), name = 'E2E Tester') {
  await page.goto('/signup');
  await page.locator('#name').fill(name);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/app\/onboarding/);
  return { email, name };
}

export async function signIn(page: Page, email: string) {
  await page.goto('/signin');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app/);
}

export async function signOut(page: Page) {
  await page.goto('/app/settings');
  await page.getByRole('button', { name: 'Sign out' }).first().click();
  await expect(page).toHaveURL('/');
}

/** Skips onboarding and lands on the dashboard. */
export async function skipOnboarding(page: Page) {
  await page.goto('/app/onboarding');
  const skip = page.getByRole('button', { name: /Skip the setup/i });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
  } else {
    await page.goto('/app');
  }
  await expect(page).toHaveURL(/\/app$/);
}

export async function registerAndSkip(page: Page, prefix = 'e2e') {
  const account = await register(page, uniqueEmail(prefix));
  await skipOnboarding(page);
  return account;
}

/** Adds a benefit through the real form and returns its URL. */
export async function addBenefit(
  page: Page,
  fields: { title: string; merchant?: string; value?: string; expiresAt?: string; code?: string },
) {
  await page.goto('/app/benefits/new');
  await page.locator('#title').fill(fields.title);
  if (fields.merchant) await page.locator('#merchant').fill(fields.merchant);
  if (fields.value) await page.locator('#originalValue').fill(fields.value);
  if (fields.expiresAt) await page.locator('#expiresAt').fill(fields.expiresAt);
  if (fields.code) {
    // The code lives in a collapsed section; open it the way a person would.
    await page.getByText('Code, conditions and notes').click();
    await page.locator('#code').fill(fields.code);
  }
  await page.getByRole('button', { name: 'Save benefit' }).click();
  await expect(page).toHaveURL(/\/app\/benefits\/b_/);
  return page.url();
}

export function isoInDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
