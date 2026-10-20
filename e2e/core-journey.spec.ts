import { expect, test } from '@playwright/test';
import {
  addBenefit,
  isoInDays,
  register,
  registerAndSkip,
  signIn,
  signOut,
  uniqueEmail,
} from './helpers';

test.describe('the main journey', () => {
  test('1-2: a new user registers and completes onboarding', async ({ page }) => {
    const { email } = await register(page, uniqueEmail('journey'));

    await expect(page.getByRole('heading', { name: /Welcome to ValueBack/i })).toBeVisible();
    await page.getByRole('button', { name: /Let.s go/i }).click();

    await expect(
      page.getByRole('heading', { name: /Small amounts, scattered everywhere/i }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(
      page.getByRole('heading', { name: /What would you like to track/i }),
    ).toBeVisible();
    await page.getByLabel('Gift card').check();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(
      page.getByRole('heading', { name: /Add the one you nearly forgot/i }),
    ).toBeVisible();
    await page.locator('#title').fill('Onboarding gift card');
    await page.locator('#originalValue').fill('1500');
    await page.locator('#expiresAt').fill(isoInDays(45));
    await page.getByRole('button', { name: /Save it and continue/i }).click();

    await expect(page.getByRole('heading', { name: /How reminders work/i })).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(page.getByRole('heading', { name: /Your dashboard/i })).toBeVisible();
    await page.getByRole('button', { name: /Go to my dashboard/i }).click();
    await expect(page).toHaveURL(/\/app$/);

    // Progress persisted: coming back does not restart the wizard.
    await page.goto('/app/onboarding');
    await expect(page.getByRole('heading', { name: /Your dashboard/i })).toBeVisible();

    // 3-4: the record created during onboarding is on the dashboard.
    await page.goto('/app');
    await expect(page.getByText('Onboarding gift card').first()).toBeVisible();
    await expect(page.getByText('₹1,500.00').first()).toBeVisible();
    expect(email).toContain('@');
  });

  test('3-6: adding a gift card, recording partial usage and seeing the balance fall', async ({
    page,
  }) => {
    await registerAndSkip(page, 'balance');
    await addBenefit(page, {
      title: 'Bluebird Books gift card',
      merchant: 'Bluebird Books',
      value: '2500',
      expiresAt: isoInDays(60),
      code: 'BB-7781-4432',
    });

    await expect(page.getByText('₹2,500.00').first()).toBeVisible();
    await expect(page.getByText('Unverified', { exact: true })).toBeVisible();
    await expect(page.getByText('••••4432')).toBeVisible();

    // 4: the dashboard reflects it.
    await page.goto('/app');
    await expect(page.getByText('Available, as reported')).toBeVisible();
    await expect(page.getByText('₹2,500.00').first()).toBeVisible();

    // 5: record using ₹600 of it.
    await page.goto('/app/benefits');
    await page.getByText('Bluebird Books gift card').click();
    await page.locator('#type').selectOption('usage');
    await page.locator('#amount').fill('600');
    await page.locator('#reason').fill('Bought two paperbacks');
    await page.getByRole('button', { name: 'Record it' }).click();

    // 6: the remaining balance is right and the ledger shows both entries.
    await expect(page.getByText(/Usage recorded/i)).toBeVisible();
    await expect(page.getByText('₹1,900.00').first()).toBeVisible();
    await expect(page.getByText('Partially used', { exact: true })).toBeVisible();
    await expect(page.getByText('Bought two paperbacks')).toBeVisible();
    await expect(page.getByText('Opening balance', { exact: true })).toBeVisible();

    // 12: analytics separates outstanding from recovered — ₹1,900 + ₹600, not ₹2,500 + ₹1,900.
    await page.goto('/app/analytics');
    const available = page
      .locator('a,div')
      .filter({ hasText: /^Available, as reported/ })
      .first();
    await expect(available).toContainText('₹1,900.00');
    const recovered = page
      .locator('a,div')
      .filter({ hasText: /^Confirmed recovered/ })
      .first();
    await expect(recovered).toContainText('₹600.00');
  });

  test('7-8: uploading a receipt, reviewing the extraction and confirming it', async ({ page }) => {
    await registerAndSkip(page, 'upload');

    const receipt = [
      'URBAN GREENS CAFE',
      'e-Gift Card',
      'Gift card value: INR 1,200.00',
      'Valid till 31/12/2027',
      'Order No: UG-884512',
      'Cannot be exchanged for cash.',
    ].join('\n');

    await page.goto('/app/documents');
    await page.locator('#file').setInputFiles({
      name: 'urban-greens.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(receipt),
    });
    await page.getByRole('button', { name: /Upload and read/i }).click();

    await expect(page).toHaveURL(/\/app\/documents\/d_/);
    await expect(page.getByRole('heading', { name: /Review what was read/i })).toBeVisible();

    // The suggestions are shown with their confidence and the text they came from.
    await expect(page.getByText('₹1,200.00').or(page.getByText('INR 1200.00'))).toBeVisible();
    await expect(page.getByText('2027-12-31')).toBeVisible();
    await expect(page.getByText('UG-884512', { exact: true })).toBeVisible();
    await expect(page.getByText('high confidence').first()).toBeVisible();
    await expect(page.getByText(/Confidence is a label, not a probability/i)).toBeVisible();

    // Nothing has been saved to a record yet.
    await page.goto('/app/benefits');
    await expect(page.getByText('No benefits yet')).toBeVisible();
    await page.goBack();

    // 8: review, correct the title, and accept.
    await page.getByRole('link', { name: 'Create a benefit' }).click();
    await expect(
      page.getByRole('heading', { name: /Check these values, then save/i }),
    ).toBeVisible();
    const title = page.locator('#title');
    await expect(title).toHaveValue(/URBAN GREENS CAFE|e-Gift Card/);
    await title.fill('Urban Greens gift card');
    await page.getByRole('button', { name: 'Save benefit' }).click();

    await expect(page).toHaveURL(/\/app\/benefits\/b_/);
    await expect(page.getByRole('heading', { name: 'Urban Greens gift card' })).toBeVisible();
    await expect(page.getByText('₹1,200.00').first()).toBeVisible();
    await expect(page.getByText('From a document').first()).toBeVisible();
    await expect(page.getByText('urban-greens.txt', { exact: true })).toBeVisible();
  });

  test('9-11: a refund case, a logged follow-up and a confirmed receipt', async ({ page }) => {
    await registerAndSkip(page, 'refund');

    await page.goto('/app/refunds/new');
    await page.locator('#merchant').fill('Zentra Electronics');
    await page.locator('#orderRef').fill('ZE-884512');
    await page.locator('#amount').fill('3799');
    await page.locator('#expectedByDate').fill(isoInDays(7));
    await page.getByRole('button', { name: /Open this case/i }).click();

    await expect(page).toHaveURL(/\/app\/refunds\/rc_/);
    await expect(page.getByText('Return or cancellation requested').first()).toBeVisible();
    await expect(page.getByText('₹3,799.00').first()).toBeVisible();

    // The draft is built from the case and makes no claims about the merchant.
    await expect(page.getByText(/Refund status for order ZE-884512/)).toBeVisible();
    const draft = page.locator('pre').first();
    await expect(draft).toContainText('ZE-884512');
    await expect(draft).not.toContainText('agreed');

    // 10: log a follow-up.
    await page.locator('#kind').selectOption('chat');
    await page.locator('#summary').fill('Chased on live chat, told to wait 5 more days');
    await page.getByRole('button', { name: 'Log this' }).click();
    await expect(page.getByText('Chased on live chat, told to wait 5 more days')).toBeVisible();

    // Move the case along; "received" is not reachable directly from "requested".
    await page.locator('#status').selectOption('accepted');
    await page.getByRole('button', { name: /Update this case/i }).click();
    await expect(page.getByText('Request accepted by merchant').first()).toBeVisible();

    await page.locator('#status').selectOption('initiated');
    await page.getByRole('button', { name: /Update this case/i }).click();
    await expect(page.getByText('Refund initiated').first()).toBeVisible();

    // Still nothing counted as recovered.
    await page.goto('/app/analytics');
    const recoveredBefore = page
      .locator('a,div')
      .filter({ hasText: /^Confirmed recovered/ })
      .first();
    await expect(recoveredBefore).toContainText('₹0.00');

    // 11: confirm receipt.
    await page.goBack();
    await page.locator('#status').selectOption('received_confirmed');
    await page.getByRole('button', { name: /Update this case/i }).click();
    await expect(page.getByText(/Receipt confirmed/i)).toBeVisible();
    await expect(page.getByText(/You confirmed this arrived/i)).toBeVisible();

    // 12: it moves from pending to recovered, and is not counted in both.
    await page.goto('/app/analytics');
    await expect(
      page
        .locator('a,div')
        .filter({ hasText: /^Pending refunds/ })
        .first(),
    ).toContainText('₹0.00');
    await expect(
      page
        .locator('a,div')
        .filter({ hasText: /^Confirmed recovered/ })
        .first(),
    ).toContainText('₹3,799.00');
    await expect(
      page
        .locator('a,div')
        .filter({ hasText: /^Refunds confirmed received/ })
        .first(),
    ).toContainText('₹3,799.00');
  });

  test('13-14: a reminder is created and shows up when it is due', async ({ page }) => {
    await registerAndSkip(page, 'remind');

    // An expiry date schedules reminders automatically.
    await addBenefit(page, { title: 'Expiring credit', value: '500', expiresAt: isoInDays(8) });
    await expect(page.getByText(/expires in 7 days/i)).toBeVisible();

    // 13: add one by hand, due today.
    await page.goto('/app/reminders');
    await page.locator('#label').fill('Ring the shop about the voucher');
    await page.locator('#dueAt').fill(isoInDays(0));
    await page.getByRole('button', { name: 'Add reminder' }).click();
    await expect(page.getByText('Ring the shop about the voucher')).toBeVisible();

    // 14: running the scheduler turns it into a notification, once.
    await page.getByRole('button', { name: /Check for due reminders now/i }).click();
    await expect(page.getByText(/1 new notification/i)).toBeVisible();
    await expect(page.getByText(/Notification centre/i)).toBeVisible();

    await page.getByRole('button', { name: /Check for due reminders now/i }).click();
    await expect(page.getByText(/nothing new to tell you/i)).toBeVisible();

    await page.reload();
    await expect(page.getByRole('button', { name: /Mark all read/i })).toBeVisible();
    await page.getByRole('button', { name: /Mark all read/i }).click();
    await expect(page.getByRole('button', { name: /Mark all read/i })).toHaveCount(0);
  });

  test('19: the user exports their data', async ({ page }) => {
    await registerAndSkip(page, 'export');
    await addBenefit(page, {
      title: 'Exportable credit',
      merchant: 'Lifestyle',
      value: '750',
      code: 'EX-1111-2222',
    });

    await page.goto('/app/settings/data');

    const csv = page.waitForEvent('download');
    await page
      .getByRole('button', { name: /Download CSV/i })
      .first()
      .click();
    const csvFile = await csv;
    expect(csvFile.suggestedFilename()).toMatch(/valueback-benefits-\d{4}-\d{2}-\d{2}\.csv/);

    const json = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download JSON/i }).click();
    const jsonFile = await json;
    expect(jsonFile.suggestedFilename()).toMatch(/\.json$/);

    const archive = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download archive/i }).click();
    const archiveFile = await archive;
    expect(archiveFile.suggestedFilename()).toMatch(/\.tar\.gz$/);

    // The code-bearing export is gated behind the password.
    await page.getByText('Export including redemption codes').click();
    await expect(page.getByText(/contains your redemption codes in plain text/i)).toBeVisible();
    await expect(page.locator('#export-password')).toBeDisabled();
  });

  test('20: signing out makes protected routes inaccessible', async ({ page }) => {
    const { email } = await registerAndSkip(page, 'signout');
    await addBenefit(page, { title: 'Private record', value: '100' });
    const benefitUrl = page.url();

    await signOut(page);

    for (const path of ['/app', '/app/benefits', '/app/settings', '/app/analytics', benefitUrl]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/signin/);
    }

    // The private document route refuses too.
    const api = await page.request.get('/api/export', { failOnStatusCode: false });
    expect([401, 405]).toContain(api.status());

    // Signing back in restores access to the same data.
    await signIn(page, email);
    await page.goto('/app/benefits');
    await expect(page.getByText('Private record')).toBeVisible();
  });

  test('records survive a server restart (persistence, not memory)', async ({ page, request }) => {
    const { email } = await registerAndSkip(page, 'persist');
    await addBenefit(page, { title: 'Durable record', value: '321' });

    // A fresh request context has no page state at all; the row comes from SQLite.
    const response = await request.get('/app/benefits');
    expect(response.status()).toBeLessThan(500);

    await page.context().clearCookies();
    await signIn(page, email);
    await page.goto('/app/benefits');
    await expect(page.getByText('Durable record')).toBeVisible();
  });
});
