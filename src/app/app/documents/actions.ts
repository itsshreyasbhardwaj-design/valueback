'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUserForAction } from '@/lib/auth';
import { getDocumentFor, NotFoundError, getBenefitFor, getRefundCaseFor } from '@/lib/authz';
import {
  deleteDocument,
  documentsThisMonth,
  linkDocument,
  processDocument,
  storeDocument,
  UPLOAD_MAX_LABEL,
} from '@/lib/documents';
import { PLAN_LIMITS } from '@/lib/entitlements';
import { LIMITS, rateLimit } from '@/lib/rate-limit';
import type { FormState } from '@/lib/validation';

export async function uploadDocumentAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();

  const limit = rateLimit(`upload:${user.id}`, LIMITS.upload.limit, LIMITS.upload.windowMs);
  if (!limit.ok)
    return { ok: false, errors: { _form: 'That is a lot of uploads at once. Try again shortly.' } };

  const monthly = PLAN_LIMITS[user.plan].documentsPerMonth;
  if (documentsThisMonth(user.id) >= monthly) {
    return {
      ok: false,
      errors: {
        _form: `Your plan allows ${monthly} uploads a month. The count resets at the start of next month.`,
      },
    };
  }

  const file = fd.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, errors: { file: `Choose a file to upload (max ${UPLOAD_MAX_LABEL}).` } };
  }

  const benefitId = (fd.get('benefitId') as string) || null;
  const refundCaseId = (fd.get('refundCaseId') as string) || null;
  // A document can only be attached to a record the uploader may already edit.
  try {
    if (benefitId) getBenefitFor(user.id, benefitId, 'edit');
    if (refundCaseId) getRefundCaseFor(user.id, refundCaseId, 'edit');
  } catch {
    return { ok: false, errors: { _form: 'That record could not be found.' } };
  }

  const stored = await storeDocument(user.id, file, { benefitId, refundCaseId });
  if (!stored.ok) return { ok: false, errors: { file: stored.error } };

  // Reading the file can take a moment (OCR especially); it happens before the
  // redirect so the review screen always has something to show.
  await processDocument(stored.document, user.settings.currency);

  revalidatePath('/app/documents');
  if (benefitId) revalidatePath(`/app/benefits/${benefitId}`);
  if (refundCaseId) revalidatePath(`/app/refunds/${refundCaseId}`);
  redirect(
    `/app/documents/${stored.document.id}${stored.duplicateOfId ? `?duplicate=${stored.duplicateOfId}` : '?uploaded=1'}`,
  );
}

export async function reprocessDocumentAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const id = String(fd.get('id') ?? '');
  try {
    const doc = getDocumentFor(user.id, id);
    const result = await processDocument(doc, user.settings.currency);
    revalidatePath(`/app/documents/${id}`);
    return {
      ok: true,
      message: result.result
        ? 'Read again and the suggestions were refreshed.'
        : (result.note ?? 'No text could be read from this file.'),
    };
  } catch (err) {
    if (err instanceof NotFoundError)
      return { ok: false, errors: { _form: 'Document not found.' } };
    throw err;
  }
}

export async function deleteDocumentAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const id = String(fd.get('id') ?? '');
  try {
    const doc = getDocumentFor(user.id, id);
    if (doc.userId !== user.id)
      return { ok: false, errors: { _form: 'Only the person who uploaded a file can delete it.' } };
    deleteDocument(user.id, doc);
  } catch (err) {
    if (err instanceof NotFoundError)
      return { ok: false, errors: { _form: 'Document not found.' } };
    throw err;
  }
  revalidatePath('/app/documents');
  redirect('/app/documents?deleted=1');
}

export async function attachDocumentAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const id = String(fd.get('id') ?? '');
  const target = String(fd.get('target') ?? '');
  if (!target) return { ok: false, errors: { target: 'Choose a record to attach this to.' } };

  const [kind, recordId] = target.split(':');
  try {
    getDocumentFor(user.id, id);
    if (kind === 'benefit') {
      getBenefitFor(user.id, recordId!, 'edit');
      linkDocument(id, { benefitId: recordId, refundCaseId: null });
    } else {
      getRefundCaseFor(user.id, recordId!, 'edit');
      linkDocument(id, { refundCaseId: recordId, benefitId: null });
    }
  } catch {
    return { ok: false, errors: { _form: 'That record could not be found.' } };
  }
  revalidatePath(`/app/documents/${id}`);
  return { ok: true, message: 'Attached to the record.' };
}
