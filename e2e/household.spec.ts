import { expect, test, type Page } from '@playwright/test';
import { addBenefit, PASSWORD, register, registerAndSkip, uniqueEmail } from './helpers';

/** Signs the given account in, replacing whoever was signed in before. */
async function switchTo(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto('/signin');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app/);
}

test.describe('FamilyValue', () => {
  test('15-18: create a household, invite, share, enforce and revoke', async ({ page }) => {
    // 15: the owner creates a household.
    const owner = await registerAndSkip(page, 'owner');
    const benefitUrl = await addBenefit(page, {
      title: 'Shared store credit',
      merchant: 'Lifestyle',
      value: '1000',
    });
    const privateUrl = await addBenefit(page, { title: 'Private gift card', value: '2000' });

    await page.goto('/app/household');
    await page.locator('#name').fill('Our flat');
    await page.getByRole('button', { name: /Create a household/i }).click();
    await expect(page.getByRole('heading', { name: 'Our flat' })).toBeVisible();
    await expect(page.getByText(/you are the owner/i)).toBeVisible();

    // The invitation code is shown exactly once.
    await page.locator('#role').selectOption('member');
    await page.getByRole('button', { name: /Create invitation/i }).click();
    await expect(page.getByText(/Copy this link now/i)).toBeVisible();
    const link = (await page.locator('p.font-mono').first().textContent())!.trim();
    const token = new URL(link).searchParams.get('invite')!;
    expect(token.length).toBeGreaterThan(20);

    // Share one record, deliberately not the other.
    await page.goto(benefitUrl);
    await page.locator('#householdId').selectOption({ index: 0 });
    await page.locator('#permission').selectOption('view');
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(page.getByText(/Shared\. Household members can see/i)).toBeVisible();

    // 16: a second account joins through the invitation.
    const memberEmail = uniqueEmail('member');
    await page.context().clearCookies();
    await register(page, memberEmail, 'Member');
    await page.goto(`/app/household?invite=${token}`);
    await page.getByRole('button', { name: /Join this household/i }).click();
    await expect(page.getByRole('heading', { name: 'Our flat' })).toBeVisible();
    await expect(page.getByText(/you are the member/i)).toBeVisible();

    // 17: the shared record is visible; the other one is not, and cannot be reached by URL.
    await page.goto('/app/benefits');
    await expect(page.getByText('Shared store credit')).toBeVisible();
    await expect(page.getByText('Private gift card')).toHaveCount(0);

    await page.goto(privateUrl);
    await expect(page.getByText(/That page does not exist/i)).toBeVisible();

    // A view grant really is read-only: no balance form, no edit link.
    await page.goto(benefitUrl);
    await expect(page.getByText(/You have view-only access/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Record it' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Edit details/i })).toHaveCount(0);

    // 18: the owner revokes the share.
    await switchTo(page, owner.email);
    await page.goto(benefitUrl);
    await page.getByRole('button', { name: /Stop sharing/i }).click();
    await expect(page.getByText(/Sharing stopped/i)).toBeVisible();

    await switchTo(page, memberEmail);
    await page.goto('/app/benefits');
    await expect(page.getByText('Shared store credit')).toHaveCount(0);
    await page.goto(benefitUrl);
    await expect(page.getByText(/That page does not exist/i)).toBeVisible();
  });

  test('an edit grant lets a member act, and removing them ends it', async ({ page }) => {
    const owner = await registerAndSkip(page, 'owner2');
    const benefitUrl = await addBenefit(page, { title: 'Jointly managed credit', value: '500' });

    await page.goto('/app/household');
    await page.locator('#name').fill('Shared house');
    await page.getByRole('button', { name: /Create a household/i }).click();
    await page.locator('#role').selectOption('member');
    await page.getByRole('button', { name: /Create invitation/i }).click();
    const link = (await page.locator('p.font-mono').first().textContent())!.trim();
    const token = new URL(link).searchParams.get('invite')!;

    await page.goto(benefitUrl);
    await page.locator('#householdId').selectOption({ index: 0 });
    await page.locator('#permission').selectOption('edit');
    await page.getByRole('button', { name: 'Share', exact: true }).click();

    const memberEmail = uniqueEmail('member2');
    await page.context().clearCookies();
    await register(page, memberEmail, 'Member two');
    await page.goto(`/app/household?invite=${token}`);
    await page.getByRole('button', { name: /Join this household/i }).click();

    // The member can record usage on the shared record.
    await page.goto(benefitUrl);
    await expect(page.getByText(/You have view and edit access/i)).toBeVisible();
    await page.locator('#type').selectOption('usage');
    await page.locator('#amount').fill('200');
    await page.locator('#reason').fill('Used by a household member');
    await page.getByRole('button', { name: 'Record it' }).click();
    await expect(page.getByText('₹300.00').first()).toBeVisible();

    // …but cannot delete it or re-share it; those are the owner's alone.
    await expect(page.getByRole('button', { name: /Delete permanently/i })).toHaveCount(0);
    await expect(page.getByText(/Only its owner can change who else can see it/i)).toBeVisible();

    // The owner removes them.
    await switchTo(page, owner.email);
    await page.goto('/app/household');
    await page.getByRole('button', { name: 'Remove' }).first().click();
    await expect(page.getByText(/1 of 4 members/i)).toBeVisible();

    await switchTo(page, memberEmail);
    await page.goto(benefitUrl);
    await expect(page.getByText(/That page does not exist/i)).toBeVisible();
  });

  test('a revoked invitation cannot be used', async ({ page }) => {
    await registerAndSkip(page, 'revoker');
    await page.goto('/app/household');
    await page.locator('#name').fill('Revoke test');
    await page.getByRole('button', { name: /Create a household/i }).click();
    await page.locator('#role').selectOption('member');
    await page.getByRole('button', { name: /Create invitation/i }).click();
    const link = (await page.locator('p.font-mono').first().textContent())!.trim();
    const token = new URL(link).searchParams.get('invite')!;

    await page.getByRole('button', { name: 'Revoke' }).click();
    await expect(page.getByText(/Open invitations/i)).toHaveCount(0);

    const otherEmail = uniqueEmail('rejected');
    await page.context().clearCookies();
    await register(page, otherEmail, 'Rejected');
    await page.goto(`/app/household?invite=${token}`);
    await page.getByRole('button', { name: /Join this household/i }).click();
    await expect(page.getByText(/has been revoked/i)).toBeVisible();
  });

  test('a made-up invitation code is rejected', async ({ page }) => {
    await registerAndSkip(page, 'forger');
    await page.goto('/app/household');
    await page.locator('#token').fill('this-is-not-a-real-invitation-token');
    await page.getByRole('button', { name: /Join this household/i }).click();
    await expect(page.getByText(/not valid/i)).toBeVisible();
  });
});
