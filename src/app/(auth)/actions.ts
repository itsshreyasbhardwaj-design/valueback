'use server';

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { recoveryCodes, userSettings, users } from '@/lib/db/schema';
import {
  assertSameOrigin,
  createSession,
  destroySession,
  registerUser,
  verifyCredentials,
} from '@/lib/auth';
import { hashPassword, normaliseRecoveryCode, verifyPassword } from '@/lib/crypto';
import { LIMITS, rateLimit, sweepRateLimits } from '@/lib/rate-limit';
import {
  fieldErrors,
  formObject,
  passwordField,
  signInSchema,
  signUpSchema,
  type FormState,
} from '@/lib/validation';
import { audit } from '@/lib/audit';
import { nowIso } from '@/lib/dates';

export async function signUpAction(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertSameOrigin();
  sweepRateLimits();
  const parsed = signUpSchema.safeParse(formObject(fd));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const limit = rateLimit(
    `signup:${parsed.data.email}`,
    LIMITS.signUp.limit,
    LIMITS.signUp.windowMs,
  );
  if (!limit.ok) {
    return {
      ok: false,
      errors: { _form: 'Too many sign-up attempts. Try again in a few minutes.' },
    };
  }

  const result = await registerUser(parsed.data.email, parsed.data.password, parsed.data.name);
  if (!result.ok) return { ok: false, errors: { email: result.error } };

  audit(result.userId, 'auth.register', 'user', result.userId, {});
  await createSession(result.userId);
  redirect('/app/onboarding');
}

export async function signInAction(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertSameOrigin();
  sweepRateLimits();
  const parsed = signInSchema.safeParse(formObject(fd));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const limit = rateLimit(
    `signin:${parsed.data.email}`,
    LIMITS.signIn.limit,
    LIMITS.signIn.windowMs,
  );
  if (!limit.ok) {
    return {
      ok: false,
      errors: {
        _form: `Too many sign-in attempts for this address. Try again in about ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`,
      },
    };
  }

  const userId = verifyCredentials(parsed.data.email, parsed.data.password);
  if (!userId) {
    // One message for both cases: never reveal whether an address is registered.
    return { ok: false, errors: { _form: 'Those details do not match an account.' } };
  }

  audit(userId, 'auth.signin', 'user', userId, {});
  await createSession(userId);
  const settings = db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();
  redirect(settings?.onboardingCompletedAt ? '/app' : '/app/onboarding');
}

export async function signOutAction(): Promise<void> {
  await assertSameOrigin();
  await destroySession();
  redirect('/');
}

/**
 * Account recovery using a code the user generated and stored themselves.
 * There is no email provider, so this is the only route back into an account.
 */
export async function recoverAction(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertSameOrigin();
  sweepRateLimits();
  const raw = formObject(fd);
  const email = (raw.email ?? '').trim().toLowerCase();
  const code = normaliseRecoveryCode(raw.code ?? '');
  const password = passwordField.safeParse(raw.newPassword ?? '');

  if (!email || !code)
    return { ok: false, errors: { _form: 'Enter your email address and one recovery code.' } };
  if (!password.success)
    return { ok: false, errors: { newPassword: password.error.issues[0]!.message } };
  if (raw.newPassword !== raw.confirmPassword) {
    return { ok: false, errors: { confirmPassword: 'The two passwords do not match.' } };
  }

  const limit = rateLimit(`recover:${email}`, LIMITS.recovery.limit, LIMITS.recovery.windowMs);
  if (!limit.ok)
    return { ok: false, errors: { _form: 'Too many recovery attempts. Try again later.' } };

  const user = db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
  const generic = {
    ok: false as const,
    errors: { _form: 'That email address and recovery code do not match.' },
  };
  if (!user) return generic;

  const codes = db.select().from(recoveryCodes).where(eq(recoveryCodes.userId, user.id)).all();
  const match = codes.find((c) => !c.usedAt && verifyPassword(code, c.codeHash));
  if (!match) return generic;

  db.transaction((tx) => {
    tx.update(users)
      .set({ passwordHash: hashPassword(raw.newPassword!), updatedAt: nowIso() })
      .where(eq(users.id, user.id))
      .run();
    tx.update(recoveryCodes).set({ usedAt: nowIso() }).where(eq(recoveryCodes.id, match.id)).run();
  });
  audit(user.id, 'auth.recover', 'user', user.id, {});

  await createSession(user.id);
  redirect('/app/settings/security?recovered=1');
}
