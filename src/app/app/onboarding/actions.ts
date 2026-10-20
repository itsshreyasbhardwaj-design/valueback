'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { userSettings, BENEFIT_CATEGORIES, type BenefitCategory } from '@/lib/db/schema';
import { requireUserForAction } from '@/lib/auth';
import { createBenefit } from '@/lib/benefits';
import { checkBenefitLimit } from '@/lib/entitlements';
import { parseOffsets } from '@/lib/reminders';
import { parseMoneyToMinor } from '@/lib/money';
import { nowIso } from '@/lib/dates';
import { audit } from '@/lib/audit';
import { benefitSchema, fieldErrors, formObject, type FormState } from '@/lib/validation';

function setStep(userId: string, step: number, extra: Partial<typeof userSettings.$inferInsert> = {}) {
  db.update(userSettings)
    .set({ onboardingStep: step, updatedAt: nowIso(), ...extra })
    .where(eq(userSettings.userId, userId))
    .run();
}

export async function goToStepAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const step = Number(fd.get('step') ?? 0);
  setStep(user.id, Number.isFinite(step) ? Math.max(0, Math.min(5, step)) : 0);
  revalidatePath('/app/onboarding');
  return { ok: true };
}

export async function saveInterestsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const picked = fd
    .getAll('interests')
    .map(String)
    .filter((v): v is BenefitCategory => BENEFIT_CATEGORIES.includes(v as BenefitCategory));
  setStep(user.id, 3, { onboardingInterests: JSON.stringify(picked) });
  revalidatePath('/app/onboarding');
  return { ok: true, message: picked.length ? 'Saved.' : 'Skipped — you can track anything later.' };
}

/** Minimal create used only inside onboarding, so the flow is not interrupted. */
export async function quickAddBenefitAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const parsed = benefitSchema.safeParse(formObject(fd));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const d = parsed.data;

  const limit = checkBenefitLimit(user.id, user.plan);
  if (!limit.allowed) return { ok: false, errors: { _form: limit.message! } };

  const value = d.originalValue ? parseMoneyToMinor(d.originalValue, d.currency) : null;
  if (d.originalValue && value == null) return { ok: false, errors: { originalValue: 'Enter a valid amount.' } };

  const created = createBenefit({
    userId: user.id,
    title: d.title,
    category: d.category,
    merchant: d.merchant,
    currency: d.currency,
    originalValueMinor: value,
    currentValueMinor: value,
    expiresAt: d.expiresAt ?? null,
    reminderOffsets: parseOffsets(user.settings.reminderOffsets),
  });

  setStep(user.id, 4);
  revalidatePath('/app');
  revalidatePath('/app/onboarding');
  return { ok: true, message: `“${created.title}” saved.`, payload: { benefitId: created.id } };
}

export async function finishOnboardingAction(): Promise<void> {
  const user = await requireUserForAction();
  setStep(user.id, 5, { onboardingCompletedAt: nowIso() });
  audit(user.id, 'onboarding.complete', 'user', user.id, {});
  revalidatePath('/app', 'layout');
  redirect('/app');
}

export async function skipOnboardingAction(): Promise<void> {
  const user = await requireUserForAction();
  setStep(user.id, 5, { onboardingCompletedAt: nowIso() });
  audit(user.id, 'onboarding.skip', 'user', user.id, {});
  revalidatePath('/app', 'layout');
  redirect('/app');
}
