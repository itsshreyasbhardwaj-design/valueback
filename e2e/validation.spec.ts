import { expect, test } from '@playwright/test';
import { addBenefit, isoInDays, registerAndSkip } from './helpers';

test.describe('validation and refusals', () => {
  test('a file that is not what it claims to be is refused', async ({ page }) => {
    await registerAndSkip(page, 'corrupt');
    await page.goto('/app/documents');

    // ELF header, named .pdf.
    await page.locator('#file').setInputFiles({
      name: 'invoice.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0, 0, 0, 0, 0]),
    });
    await page.getByRole('button', { name: /Upload and read/i }).click();
    await expect(page.getByText(/file contents are checked, not just the name/i)).toBeVisible();
    await expect(page).toHaveURL(/\/app\/documents$/);
  });

  test('an empty file is refused', async ({ page }) => {
    await registerAndSkip(page, 'empty');
    await page.goto('/app/documents');
    await page
      .locator('#file')
      .setInputFiles({ name: 'nothing.txt', mimeType: 'text/plain', buffer: Buffer.from('') });
    await page.getByRole('button', { name: /Upload and read/i }).click();
    await expect(page.getByText(/Choose a file to upload|empty/i).first()).toBeVisible();
  });

  test('a damaged PDF is reported honestly rather than guessed at', async ({ page }) => {
    await registerAndSkip(page, 'brokenpdf');
    await page.goto('/app/documents');
    await page.locator('#file').setInputFiles({
      name: 'broken.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\nnot really a pdf at all'),
    });
    await page.getByRole('button', { name: /Upload and read/i }).click();
    await expect(page).toHaveURL(/\/app\/documents\/d_/);
    await expect(page.getByText(/No text could be read from this file/i)).toBeVisible();
    await expect(page.getByText(/enter the details by hand/i).first()).toBeVisible();
  });

  test('a benefit cannot be saved without a name', async ({ page }) => {
    await registerAndSkip(page, 'noname');
    await page.goto('/app/benefits/new');
    await page.locator('#originalValue').fill('100');
    await page.getByRole('button', { name: 'Save benefit' }).click();
    await expect(page.getByText(/Give this record a name/i)).toBeVisible();
    await expect(page).toHaveURL(/\/app\/benefits\/new$/);
  });

  test('a nonsense amount is rejected with an explanation', async ({ page }) => {
    await registerAndSkip(page, 'badamount');
    await page.goto('/app/benefits/new');
    await page.locator('#title').fill('Odd amount');
    await page.locator('#originalValue').fill('not a number');
    await page.getByRole('button', { name: 'Save benefit' }).click();
    await expect(page.getByText(/Enter an amount like 2500/i)).toBeVisible();
  });

  test('spending more than the balance is refused by the server', async ({ page }) => {
    await registerAndSkip(page, 'overspend');
    await addBenefit(page, { title: 'Small credit', value: '100' });

    await page.locator('#type').selectOption('usage');
    await page.locator('#amount').fill('500');
    await page.getByRole('button', { name: 'Record it' }).click();
    await expect(page.getByText(/more than the remaining balance/i)).toBeVisible();
    await expect(page.getByText('₹100.00').first()).toBeVisible();
  });

  test('a refund case needs an amount', async ({ page }) => {
    await registerAndSkip(page, 'norefundamount');
    await page.goto('/app/refunds/new');
    await page.locator('#merchant').fill('Somewhere');
    await page.getByRole('button', { name: /Open this case/i }).click();
    await expect(page.getByText(/Enter the refund amount/i)).toBeVisible();
  });

  test('an invalid refund transition is not offered and not accepted', async ({ page }) => {
    await registerAndSkip(page, 'badtransition');
    await page.goto('/app/refunds/new');
    await page.locator('#merchant').fill('Zentra');
    await page.locator('#amount').fill('500');
    await page.getByRole('button', { name: /Open this case/i }).click();
    await expect(page).toHaveURL(/\/app\/refunds\/rc_/);

    // From "requested", confirming receipt is not an option in the select.
    // innerText is empty for options in a closed select; textContent is not.
    const options = await page.locator('#status option').allTextContents();
    expect(options.join('|')).not.toContain('Received and confirmed');
    expect(options.join('|')).toContain('Request accepted by merchant');
  });

  test('uploading the same file twice is flagged, not silently merged', async ({ page }) => {
    await registerAndSkip(page, 'dupfile');
    const bytes = Buffer.from('Gift card value: INR 100.00\nValid till 31/12/2027');

    for (const name of ['first.txt', 'second.txt']) {
      await page.goto('/app/documents');
      await page.locator('#file').setInputFiles({ name, mimeType: 'text/plain', buffer: bytes });
      await page.getByRole('button', { name: /Upload and read/i }).click();
      await expect(page).toHaveURL(/\/app\/documents\/d_/);
    }

    await expect(page.getByText(/uploaded this exact file before/i)).toBeVisible();
    await page.goto('/app/documents');
    await expect(page.getByText('first.txt')).toBeVisible();
    await expect(page.getByText('second.txt')).toBeVisible();
  });

  test('a duplicate benefit is suggested, never merged', async ({ page }) => {
    await registerAndSkip(page, 'dupbenefit');
    await addBenefit(page, {
      title: 'Twice entered',
      merchant: 'Lifestyle',
      value: '400',
      expiresAt: isoInDays(30),
    });
    await addBenefit(page, {
      title: 'Twice entered',
      merchant: 'Lifestyle',
      value: '400',
      expiresAt: isoInDays(30),
    });

    await expect(page.getByText(/Possible duplicates/i)).toBeVisible();
    await expect(page.getByText(/Likely the same/i)).toBeVisible();

    await page.goto('/app/benefits');
    await expect(page.getByText('Twice entered')).toHaveCount(2);
  });

  test('one account cannot reach another account’s record or document', async ({ page }) => {
    await registerAndSkip(page, 'victim');
    const benefitUrl = await addBenefit(page, { title: 'Victim record', value: '900' });

    await page.goto('/app/documents');
    await page.locator('#file').setInputFiles({
      name: 'private-receipt.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('A private receipt with INR 900.00 on it'),
    });
    await page.getByRole('button', { name: /Upload and read/i }).click();
    await expect(page).toHaveURL(/\/app\/documents\/d_/);
    const documentId = page.url().split('/').pop()!.split('?')[0]!;

    // A different account, same URLs.
    await page.context().clearCookies();
    await registerAndSkip(page, 'attacker');

    await page.goto(benefitUrl);
    await expect(page.getByText(/That page does not exist/i)).toBeVisible();

    await page.goto(`/app/documents/${documentId}`);
    await expect(page.getByText(/That page does not exist/i)).toBeVisible();

    const file = await page.request.get(`/api/documents/${documentId}/file`, {
      failOnStatusCode: false,
    });
    expect(file.status()).toBe(404);
    expect(await file.text()).not.toContain('private receipt');
  });

  test('the private file route refuses an unauthenticated request', async ({ page, request }) => {
    await registerAndSkip(page, 'fileauth');
    await page.goto('/app/documents');
    await page.locator('#file').setInputFiles({
      name: 'mine.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('my own receipt'),
    });
    await page.getByRole('button', { name: /Upload and read/i }).click();
    await expect(page).toHaveURL(/\/app\/documents\/d_/);
    const documentId = page.url().split('/').pop()!.split('?')[0]!;

    // The signed-in page can read it.
    const mine = await page.request.get(`/api/documents/${documentId}/file`);
    expect(mine.status()).toBe(200);
    expect(await mine.text()).toContain('my own receipt');

    // A context with no cookies cannot.
    const anonymous = await request.get(`/api/documents/${documentId}/file`, {
      failOnStatusCode: false,
    });
    expect(anonymous.status()).toBe(401);
  });

  test('a signed-out visitor is sent to sign in, not to an error page', async ({ page }) => {
    await page.goto('/app/benefits/b_does_not_exist');
    await expect(page).toHaveURL(/\/signin/);
    await page.goto('/app/settings/data');
    await expect(page).toHaveURL(/\/signin/);
  });

  test('a signed-in user gets a clean 404 for a record id that does not exist', async ({
    page,
  }) => {
    await registerAndSkip(page, 'missing');
    await page.goto('/app/benefits/b_definitely_not_real');
    await expect(page.getByText(/That page does not exist/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /Go to the dashboard/i })).toBeVisible();
  });

  test('the marketing site makes no false claims about payments', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByText(/There is no checkout in this build/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Not available yet/i }).first()).toBeDisabled();
  });
});
