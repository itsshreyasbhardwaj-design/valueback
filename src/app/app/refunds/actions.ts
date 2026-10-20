'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { refundCases } from '@/lib/db/schema';
import { requireUserForAction } from '@/lib/auth';
import { ForbiddenError, NotFoundError, getRefundCaseFor } from '@/lib/authz';
import {
  addClaimAction,
  archiveRefundCase,
  completeClaimAction,
  createRefundCase,
  transitionRefund,
  updateRefundDetails,
} from '@/lib/refunds';
import { createCustomReminder } from '@/lib/reminders';
import { latestExtraction, linkDocument, markExtractionReviewed } from '@/lib/documents';
import { parseMoneyToMinor } from '@/lib/money';
import { audit } from '@/lib/audit';
import {
  claimActionSchema,
  fieldErrors,
  formObject,
  refundSchema,
  refundTransitionSchema,
  reminderSchema,
  type FormState,
} from '@/lib/validation';

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

export async function createRefundAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const parsed = refundSchema.safeParse(formObject(fd));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const d = parsed.data;

  const amount = parseMoneyToMinor(d.amount, d.currency);
  if (amount == null || amount <= 0) return { ok: false, errors: { amount: 'Enter the amount you expect back.' } };

  const created = createRefundCase({
    userId: user.id,
    merchant: d.merchant,
    orderRef: d.orderRef,
    referenceNumber: d.referenceNumber,
    currency: d.currency,
    amountMinor: amount,
    purchaseDate: d.purchaseDate ?? null,
    initiatedAt: d.initiatedAt ?? null,
    expectedByDate: d.expectedByDate ?? null,
    method: d.method,
    notes: d.notes,
    checkInDays: user.settings.refundCheckInDays,
    documentId: (fd.get('documentId') as string) || null,
  });

  const documentId = fd.get('documentId');
  if (typeof documentId === 'string' && documentId) {
    linkDocument(documentId, { refundCaseId: created.id });
    const extraction = latestExtraction(documentId);
    if (extraction) {
      markExtractionReviewed(extraction.id, {
        createdRecord: { type: 'refund_case', id: created.id },
        merchant: d.merchant,
        orderRef: d.orderRef,
        currency: d.currency,
        amountMinor: amount,
        expectedByDate: d.expectedByDate ?? null,
      });
    }
  }

  revalidatePath('/app');
  revalidatePath('/app/refunds');
  redirect(`/app/refunds/${created.id}?created=1`);
}

export async function updateRefundAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const id = String(fd.get('id') ?? '');
  const parsed = refundSchema.safeParse(formObject(fd));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const d = parsed.data;

  const found = guard(() => getRefundCaseFor(user.id, id, 'edit'));
  if (!found.ok) return found.state;

  const amount = parseMoneyToMinor(d.amount, d.currency);
  if (amount == null || amount <= 0) return { ok: false, errors: { amount: 'Enter a valid amount.' } };

  const result = updateRefundDetails(
    user.id,
    found.value.refundCase,
    {
      merchant: d.merchant,
      orderRef: d.orderRef,
      referenceNumber: d.referenceNumber,
      amountMinor: amount,
      purchaseDate: d.purchaseDate ?? null,
      initiatedAt: d.initiatedAt ?? null,
      expectedByDate: d.expectedByDate ?? null,
      method: d.method,
      notes: d.notes,
    },
    user.settings.refundCheckInDays,
  );
  if (!result.ok) return { ok: false, errors: { _form: result.error } };

  revalidatePath(`/app/refunds/${id}`);
  return { ok: true, message: 'Case details updated.' };
}

export async function transitionRefundAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const id = String(fd.get('id') ?? '');
  const parsed = refundTransitionSchema.safeParse(formObject(fd));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const d = parsed.data;

  const found = guard(() => getRefundCaseFor(user.id, id, 'edit'));
  if (!found.ok) return found.state;
  const rc = found.value.refundCase;

  const receivedNow = d.receivedAmount ? parseMoneyToMinor(d.receivedAmount, rc.currency) : null;
  if (d.receivedAmount && receivedNow == null) {
    return { ok: false, errors: { receivedAmount: 'Enter a valid amount.' } };
  }

  const result = transitionRefund(user.id, rc, d.status, {
    receivedNowMinor: receivedNow,
    note: d.note,
    occurredAt: d.occurredAt,
    closedReason: d.closedReason,
    checkInDays: user.settings.refundCheckInDays,
  });
  if (!result.ok) return { ok: false, errors: { _form: result.error } };

  revalidatePath(`/app/refunds/${id}`);
  revalidatePath('/app');
  revalidatePath('/app/analytics');
  return {
    ok: true,
    message:
      d.status === 'received_confirmed' || d.status === 'partially_received'
        ? 'Receipt confirmed. This amount now counts towards confirmed recovered value.'
        : 'Status updated and the timeline recorded who changed it.',
  };
}

export async function logClaimActionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const id = String(fd.get('refundCaseId') ?? '');
  const parsed = claimActionSchema.safeParse(formObject(fd));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const found = guard(() => getRefundCaseFor(user.id, id, 'edit'));
  if (!found.ok) return found.state;

  addClaimAction({
    userId: user.id,
    refundCaseId: id,
    kind: parsed.data.kind,
    summary: parsed.data.summary,
    assigneeUserId: parsed.data.assigneeUserId || null,
    dueAt: parsed.data.dueAt ?? null,
  });
  revalidatePath(`/app/refunds/${id}`);
  return { ok: true, message: 'Follow-up logged on the timeline.' };
}

export async function completeClaimActionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const id = String(fd.get('actionId') ?? '');
  const caseId = String(fd.get('refundCaseId') ?? '');
  completeClaimAction(user.id, id);
  revalidatePath(`/app/refunds/${caseId}`);
  return { ok: true, message: 'Marked as done.' };
}

export async function archiveRefundAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const id = String(fd.get('id') ?? '');
  const archive = fd.get('archive') === '1';
  const found = guard(() => getRefundCaseFor(user.id, id, 'edit'));
  if (!found.ok) return found.state;
  archiveRefundCase(user.id, found.value.refundCase, archive);
  revalidatePath(`/app/refunds/${id}`);
  revalidatePath('/app/refunds');
  return { ok: true, message: archive ? 'Case archived.' : 'Case restored.' };
}

export async function deleteRefundAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const id = String(fd.get('id') ?? '');
  const found = guard(() => getRefundCaseFor(user.id, id, 'edit'));
  if (!found.ok) return found.state;
  if (!found.value.access.isOwner) return { ok: false, errors: { _form: 'Only the owner can delete a case.' } };
  if (String(fd.get('confirm') ?? '').trim().toLowerCase() !== 'delete') {
    return { ok: false, errors: { confirm: 'Type delete to confirm.' } };
  }
  db.delete(refundCases).where(eq(refundCases.id, id)).run();
  audit(user.id, 'refund.delete', 'refund_case', id, {});
  revalidatePath('/app/refunds');
  redirect('/app/refunds?deleted=1');
}

export async function addRefundReminderAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const parsed = reminderSchema.safeParse(formObject(fd));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const found = guard(() => getRefundCaseFor(user.id, parsed.data.refundCaseId, 'view'));
  if (!found.ok) return found.state;
  createCustomReminder({
    userId: user.id,
    refundCaseId: parsed.data.refundCaseId,
    kind: parsed.data.kind,
    label: parsed.data.label,
    dueAt: parsed.data.dueAt,
  });
  revalidatePath(`/app/refunds/${parsed.data.refundCaseId}`);
  revalidatePath('/app/reminders');
  return { ok: true, message: 'Reminder scheduled.' };
}
