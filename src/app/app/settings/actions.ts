'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { db } from '@/lib/db';
import { recoveryCodes, userSettings, users } from '@/lib/db/schema';
import {
  changePassword,
  currentSessionId,
  destroySession,
  requireUserForAction,
  revokeSessions,
} from '@/lib/auth';
import { hashPassword, newRecoveryCode, normaliseRecoveryCode, verifyPassword } from '@/lib/crypto';
import { newId } from '@/lib/ids';
import { nowIso } from '@/lib/dates';
import { audit } from '@/lib/audit';
import { setPlan, devOverrideEnabled } from '@/lib/entitlements';
import { importBenefits } from '@/lib/exportdata';
import { parseOffsets } from '@/lib/reminders';
import { storageDir } from '@/lib/documents';
import { LIMITS, rateLimit } from '@/lib/rate-limit';
import {
  fieldErrors,
  formObject,
  passwordChangeSchema,
  planSchema,
  settingsSchema,
  type FormState,
} from '@/lib/validation';

export async function updateSettingsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const parsed = settingsSchema.safeParse({
    ...formObject(fd),
    notifyInApp: fd.get('notifyInApp') === 'on',
    notifyBrowser: fd.get('notifyBrowser') === 'on',
    searchDocumentText: fd.get('searchDocumentText') === 'on',
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const d = parsed.data;

  const offsets = parseOffsets(
    JSON.stringify(d.reminderOffsets.split(',').map((x) => Number(x.trim()))),
  );

  db.transaction((tx) => {
    tx.update(users).set({ name: d.name, updatedAt: nowIso() }).where(eq(users.id, user.id)).run();
    tx.update(userSettings)
      .set({
        currency: d.currency,
        dateFormat: d.dateFormat,
        timeZone: d.timeZone,
        theme: d.theme,
        reminderOffsets: JSON.stringify(offsets),
        refundCheckInDays: d.refundCheckInDays,
        notifyInApp: d.notifyInApp,
        notifyBrowser: d.notifyBrowser,
        searchDocumentText: d.searchDocumentText,
        updatedAt: nowIso(),
      })
      .where(eq(userSettings.userId, user.id))
      .run();
  });

  // Keep the cookie the server renders from in step with the saved preference.
  const jar = await cookies();
  if (d.theme === 'system') jar.delete('vb_theme');
  else jar.set('vb_theme', d.theme, { path: '/', maxAge: 31_536_000, sameSite: 'lax' });

  audit(user.id, 'settings.update', 'user', user.id, { currency: d.currency, theme: d.theme });
  revalidatePath('/app', 'layout');
  return {
    ok: true,
    message:
      'Settings saved. New reminder offsets apply to records you save from now on — use “Rebuild reminders” to apply them to everything.',
  };
}

export async function changePasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const limit = rateLimit(
    `pwd:${user.id}`,
    LIMITS.passwordChange.limit,
    LIMITS.passwordChange.windowMs,
  );
  if (!limit.ok)
    return { ok: false, errors: { _form: 'Too many attempts. Try again in a few minutes.' } };

  const parsed = passwordChangeSchema.safeParse(formObject(fd));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const result = changePassword(user.id, parsed.data.currentPassword, parsed.data.newPassword);
  if (!result.ok) return { ok: false, errors: { currentPassword: result.error } };

  // Every other session is invalidated; this one stays signed in.
  revokeSessions(user.id, (await currentSessionId()) ?? undefined);
  audit(user.id, 'auth.password_change', 'user', user.id, {});
  return { ok: true, message: 'Password changed. Any other signed-in device has been signed out.' };
}

export async function generateRecoveryCodesAction(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const user = await requireUserForAction();
  const password = String(fd.get('password') ?? '');
  const row = db
    .select({ hash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .get();
  if (!row || !verifyPassword(password, row.hash)) {
    return { ok: false, errors: { password: 'That password is not correct.' } };
  }

  const codes = Array.from({ length: 8 }, () => newRecoveryCode());
  db.transaction((tx) => {
    tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, user.id)).run();
    for (const code of codes) {
      tx.insert(recoveryCodes)
        .values({
          id: newId('rc_'),
          userId: user.id,
          codeHash: hashPassword(normaliseRecoveryCode(code)),
        })
        .run();
    }
  });
  audit(user.id, 'auth.recovery_codes.generate', 'user', user.id, { count: codes.length });
  revalidatePath('/app/settings/security');
  return {
    ok: true,
    message: 'Eight new codes generated. Any codes you had before no longer work.',
    payload: { codes },
  };
}

export async function revokeOtherSessionsAction(
  _prev: FormState,
  _fd: FormData,
): Promise<FormState> {
  const user = await requireUserForAction();
  revokeSessions(user.id, (await currentSessionId()) ?? undefined);
  audit(user.id, 'auth.sessions.revoke', 'user', user.id, {});
  revalidatePath('/app/settings/security');
  return { ok: true, message: 'Every other session has been signed out.' };
}

export async function deleteAccountAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const password = String(fd.get('password') ?? '');
  if (
    String(fd.get('confirm') ?? '')
      .trim()
      .toLowerCase() !== 'delete my account'
  ) {
    return { ok: false, errors: { confirm: 'Type "delete my account" exactly.' } };
  }
  const row = db
    .select({ hash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .get();
  if (!row || !verifyPassword(password, row.hash)) {
    return { ok: false, errors: { password: 'That password is not correct.' } };
  }

  // Remove the uploaded files first: a row-only delete would orphan them on disk.
  try {
    rmSync(resolve(storageDir(), user.id), { recursive: true, force: true });
  } catch {
    // keep going — the database rows still have to go
  }
  audit(null, 'account.delete', 'user', user.id, {});
  db.delete(users).where(eq(users.id, user.id)).run(); // cascades every owned row
  await destroySession();
  redirect('/?deleted=1');
}

export async function setPlanAction(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireUserForAction();
  if (!devOverrideEnabled()) {
    return {
      ok: false,
      errors: { _form: 'Plan switching is only available in a development build.' },
    };
  }
  const user = await requireUserForAction();
  const parsed = planSchema.safeParse(formObject(fd));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  setPlan(user.id, parsed.data.plan);
  revalidatePath('/app', 'layout');
  return {
    ok: true,
    message: `Development override: plan set to ${parsed.data.plan}. No payment was involved.`,
  };
}

export async function importBenefitsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const file = fd.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, errors: { file: 'Choose a JSON file exported from ValueBack.' } };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, errors: { file: 'That file is larger than 5 MB.' } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return { ok: false, errors: { file: 'That file is not valid JSON.' } };
  }

  const report = importBenefits(user.id, parsed, {
    onDuplicate: fd.get('onDuplicate') === 'import' ? 'import' : 'skip',
    reminderOffsets: parseOffsets(user.settings.reminderOffsets),
  });

  revalidatePath('/app/benefits');
  revalidatePath('/app');
  return {
    ok: report.errors.length === 0,
    message: `${report.created} imported, ${report.skippedDuplicates.length} skipped as duplicates, ${report.errors.length} rejected.`,
    payload: { report: JSON.parse(JSON.stringify(report)) as unknown },
  };
}
