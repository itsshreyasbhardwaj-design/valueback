'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { benefits, type BenefitStatus } from '@/lib/db/schema';
import { requireUserForAction } from '@/lib/auth';
import { getBenefitFor, ForbiddenError, NotFoundError } from '@/lib/authz';
import {
  createBenefit,
  recordBalanceEvent,
  setBenefitStatus,
  updateBenefit,
  type BalanceChange,
} from '@/lib/benefits';
import { checkBenefitLimit } from '@/lib/entitlements';
import { parseOffsets, createCustomReminder, syncExpiryReminders } from '@/lib/reminders';
import { revokeShare, shareRecord } from '@/lib/household';
import { decryptSecret } from '@/lib/crypto';
import { latestExtraction, linkDocument, markExtractionReviewed } from '@/lib/documents';
import { parseMoneyToMinor } from '@/lib/money';
import { audit } from '@/lib/audit';
import { todayIso } from '@/lib/dates';
import {
  balanceEventSchema,
  benefitSchema,
  benefitStatusSchema,
  fieldErrors,
  formObject,
  reminderSchema,
  shareSchema,
  type FormState,
} from '@/lib/validation';

/** Turns a thrown authorisation error into a form-level message. */
type Guarded<T> = { ok: true; value: T } | { ok: false; state: FormState };

function guard<T>(fn: () => T): Guarded<T> {
  try {
    return { ok: true, value: fn() };
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof ForbiddenError) {
      return { ok: false, state: { ok: false, errors: { _form: err.message } } };
    }
    throw err;
  }
}

export async function createBenefitAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const parsed = benefitSchema.safeParse(formObject(fd));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const d = parsed.data;

  const limit = checkBenefitLimit(user.id, user.plan);
  if (!limit.allowed) return { ok: false, errors: { _form: limit.message! } };

  const original = d.originalValue ? parseMoneyToMinor(d.originalValue, d.currency) : null;
  const current = d.currentValue ? parseMoneyToMinor(d.currentValue, d.currency) : null;
  if (d.originalValue && original == null) return { ok: false, errors: { originalValue: 'Enter a valid amount.' } };
  if (d.currentValue && current == null) return { ok: false, errors: { currentValue: 'Enter a valid amount.' } };
  if (original != null && current != null && current > original) {
    return { ok: false, errors: { currentValue: 'The remaining balance cannot be more than the original value.' } };
  }
  const units = d.units ? Number(d.units) : null;
  if (d.recurrence !== 'none' && !d.recurrenceUnits) {
    return { ok: false, errors: { recurrenceUnits: 'How many units are added each period?' } };
  }

  const created = createBenefit({
    userId: user.id,
    title: d.title,
    category: d.category,
    merchant: d.merchant,
    currency: d.currency,
    originalValueMinor: original,
    currentValueMinor: current ?? original,
    unitLabel: d.unitLabel || null,
    originalUnits: units,
    issuedAt: d.issuedAt ?? null,
    receivedAt: d.receivedAt ?? null,
    expiresAt: d.expiresAt ?? null,
    conditions: d.conditions,
    notes: d.notes,
    tags: d.tags ? d.tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 12) : [],
    code: d.code || null,
    recurrence: d.recurrence,
    recurrenceUnits: d.recurrenceUnits ? Number(d.recurrenceUnits) : null,
    recurrenceAnchor: d.recurrenceAnchor ?? null,
    evidence: (fd.get('evidence') as string) === 'document_extracted' ? 'document_extracted' : 'user_entered',
    reminderOffsets: parseOffsets(user.settings.reminderOffsets),
    documentId: (fd.get('documentId') as string) || null,
  });

  const documentId = fd.get('documentId');
  if (typeof documentId === 'string' && documentId) {
    linkDocument(documentId, { benefitId: created.id });
    // Record what the user actually accepted, so a later look at the document
    // shows the reviewed outcome rather than only the raw suggestion.
    const extraction = latestExtraction(documentId);
    if (extraction) {
      markExtractionReviewed(extraction.id, {
        createdRecord: { type: 'benefit', id: created.id },
        title: d.title,
        category: d.category,
        merchant: d.merchant,
        currency: d.currency,
        originalValueMinor: original,
        expiresAt: d.expiresAt ?? null,
      });
    }
  }

  revalidatePath('/app');
  revalidatePath('/app/benefits');
  redirect(`/app/benefits/${created.id}?created=1`);
}

export async function updateBenefitAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const id = String(fd.get('id') ?? '');
  const parsed = benefitSchema.safeParse(formObject(fd));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const d = parsed.data;

  const found = guard(() => getBenefitFor(user.id, id, 'edit'));
  if (!found.ok) return found.state;

  updateBenefit(
    user.id,
    found.value.benefit,
    {
      title: d.title,
      category: d.category,
      merchant: d.merchant,
      unitLabel: d.unitLabel || null,
      issuedAt: d.issuedAt ?? null,
      receivedAt: d.receivedAt ?? null,
      expiresAt: d.expiresAt ?? null,
      conditions: d.conditions,
      notes: d.notes,
      tags: d.tags ? d.tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 12) : [],
      recurrence: d.recurrence,
      recurrenceUnits: d.recurrenceUnits ? Number(d.recurrenceUnits) : null,
      recurrenceAnchor: d.recurrenceAnchor ?? null,
      code: d.code || undefined,
      clearCode: fd.get('clearCode') === 'on',
    },
    parseOffsets(user.settings.reminderOffsets),
  );

  revalidatePath(`/app/benefits/${id}`);
  revalidatePath('/app/benefits');
  redirect(`/app/benefits/${id}?saved=1`);
}

export async function recordBalanceAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const id = String(fd.get('id') ?? '');
  const parsed = balanceEventSchema.safeParse(formObject(fd));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const d = parsed.data;

  const found = guard(() => getBenefitFor(user.id, id, 'edit'));
  if (!found.ok) return found.state;
  const { benefit } = found.value;

  const amountMinor = d.amount ? parseMoneyToMinor(d.amount, benefit.currency) : null;
  if (d.amount && amountMinor == null) return { ok: false, errors: { amount: 'Enter a valid amount.' } };
  const units = d.units ? Number(d.units) : null;

  let change: BalanceChange;
  if (d.type === 'usage') {
    change = { type: 'usage', amountMinor, units, reason: d.reason || 'Recorded as used', occurredAt: d.occurredAt };
  } else if (d.type === 'redeemed') {
    change = { type: 'redeemed', reason: d.reason || 'Fully redeemed', occurredAt: d.occurredAt };
  } else if (d.type === 'revalidation') {
    change = {
      type: 'revalidation',
      newExpiresAt: d.newExpiresAt ?? null,
      reason: d.reason || 'Revalidated with the provider',
      occurredAt: d.occurredAt,
    };
  } else {
    change = {
      type: d.type,
      newValueMinor: d.amount ? amountMinor : undefined,
      newUnits: d.units ? units : undefined,
      reason: d.reason || (d.type === 'verified_update' ? 'Checked with the provider' : 'Corrected by the user'),
      occurredAt: d.occurredAt,
    };
  }

  const result = recordBalanceEvent(user.id, benefit, change, parseOffsets(user.settings.reminderOffsets));
  if (!result.ok) return { ok: false, errors: { _form: result.error } };

  revalidatePath(`/app/benefits/${id}`);
  revalidatePath('/app');
  revalidatePath('/app/analytics');
  return { ok: true, message: balanceMessage(d.type) };
}

function balanceMessage(type: string): string {
  switch (type) {
    case 'usage':
      return 'Usage recorded. The amount you used now counts towards confirmed recovered value.';
    case 'redeemed':
      return 'Marked as fully redeemed. The remaining balance counts as recovered.';
    case 'verified_update':
      return 'Verified balance saved. A verified update is not counted as recovered value — record usage separately if you spent it.';
    case 'revalidation':
      return 'Revalidation saved and reminders rescheduled.';
    default:
      return 'Correction saved. Corrections are not counted as recovered value.';
  }
}

export async function setStatusAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const id = String(fd.get('id') ?? '');
  const parsed = benefitStatusSchema.safeParse(formObject(fd));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const found = guard(() => getBenefitFor(user.id, id, 'edit'));
  if (!found.ok) return found.state;

  const result = setBenefitStatus(
    user.id,
    found.value.benefit,
    parsed.data.status as BenefitStatus,
    parseOffsets(user.settings.reminderOffsets),
  );
  if (!result.ok) return { ok: false, errors: { _form: result.error } };

  revalidatePath(`/app/benefits/${id}`);
  revalidatePath('/app/benefits');
  revalidatePath('/app');
  return { ok: true, message: `Status updated to ${parsed.data.status.replace(/_/g, ' ')}.` };
}

/** Permanent delete. Archiving is the reversible option and is a status change. */
export async function deleteBenefitAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const id = String(fd.get('id') ?? '');
  const found = guard(() => getBenefitFor(user.id, id, 'edit'));
  if (!found.ok) return found.state;
  if (!found.value.access.isOwner) {
    return { ok: false, errors: { _form: 'Only the owner of a record can delete it.' } };
  }
  if (String(fd.get('confirm') ?? '').trim().toLowerCase() !== 'delete') {
    return { ok: false, errors: { confirm: 'Type delete to confirm.' } };
  }
  db.delete(benefits).where(eq(benefits.id, id)).run();
  audit(user.id, 'benefit.delete', 'benefit', id, {});
  revalidatePath('/app/benefits');
  revalidatePath('/app');
  redirect('/app/benefits?deleted=1');
}

export async function shareBenefitAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const parsed = shareSchema.safeParse(formObject(fd));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const result = shareRecord(
    user.id,
    parsed.data.householdId,
    parsed.data.resourceType,
    parsed.data.resourceId,
    parsed.data.permission,
  );
  if (!result.ok) return { ok: false, errors: { _form: result.error } };
  revalidatePath(`/app/benefits/${parsed.data.resourceId}`);
  revalidatePath('/app/household');
  return { ok: true, message: 'Shared. Household members can see this record from now on.' };
}

export async function revokeShareAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const resourceType = fd.get('resourceType') === 'refund_case' ? 'refund_case' : 'benefit';
  const resourceId = String(fd.get('resourceId') ?? '');
  const householdId = String(fd.get('householdId') ?? '');
  const result = revokeShare(user.id, resourceType, resourceId, householdId);
  if (!result.ok) return { ok: false, errors: { _form: result.error } };
  revalidatePath(`/app/${resourceType === 'benefit' ? 'benefits' : 'refunds'}/${resourceId}`);
  revalidatePath('/app/household');
  return { ok: true, message: 'Sharing stopped. They lose access on their next request.' };
}

/** Returns the decrypted code to the caller only; it is never logged. */
export async function revealCodeAction(benefitId: string): Promise<{ ok: boolean; code?: string; error?: string }> {
  const user = await requireUserForAction();
  try {
    const { benefit } = getBenefitFor(user.id, benefitId, 'view');
    if (!benefit.codeCipher) return { ok: false, error: 'No code is stored on this record.' };
    const code = decryptSecret(benefit.codeCipher);
    if (code == null) {
      return {
        ok: false,
        error: 'The stored code could not be decrypted. This happens if APP_ENCRYPTION_KEY changed since it was saved.',
      };
    }
    audit(user.id, 'benefit.code.reveal', 'benefit', benefitId, {});
    return { ok: true, code };
  } catch {
    return { ok: false, error: 'Record not found.' };
  }
}

export async function addBenefitReminderAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const parsed = reminderSchema.safeParse(formObject(fd));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const d = parsed.data;
  if (d.benefitId) {
    const found = guard(() => getBenefitFor(user.id, d.benefitId, 'view'));
    if (!found.ok) return found.state;
  }
  createCustomReminder({
    userId: user.id,
    benefitId: d.benefitId || null,
    refundCaseId: d.refundCaseId || null,
    kind: d.kind,
    label: d.label,
    dueAt: d.dueAt,
  });
  revalidatePath('/app/reminders');
  if (d.benefitId) revalidatePath(`/app/benefits/${d.benefitId}`);
  return { ok: true, message: 'Reminder scheduled.' };
}

/** Rebuilds the expiry reminder set after a settings change. */
export async function resyncRemindersAction(): Promise<void> {
  const user = await requireUserForAction();
  const offsets = parseOffsets(user.settings.reminderOffsets);
  const rows = db.select().from(benefits).where(eq(benefits.userId, user.id)).all();
  const today = todayIso(user.settings.timeZone);
  for (const b of rows) syncExpiryReminders(user.id, b, offsets, today);
  revalidatePath('/app/reminders');
}
