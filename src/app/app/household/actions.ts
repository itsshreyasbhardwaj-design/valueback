'use server';

import { revalidatePath } from 'next/cache';
import { requireUserForAction } from '@/lib/auth';
import {
  acceptInvite,
  createHousehold,
  createInvite,
  deleteHousehold,
  leaveHousehold,
  previewInvite,
  removeMember,
  revokeInvite,
} from '@/lib/household';
import { LIMITS, rateLimit } from '@/lib/rate-limit';
import { fieldErrors, formObject, householdSchema, inviteSchema, type FormState } from '@/lib/validation';

export async function createHouseholdAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const parsed = householdSchema.safeParse(formObject(fd));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const result = createHousehold(user.id, parsed.data.name, user.plan);
  if (!result.ok) return { ok: false, errors: { _form: result.error } };
  revalidatePath('/app/household');
  return { ok: true, message: `“${result.household.name}” created. Nothing is shared into it until you share a record.` };
}

export async function createInviteAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const householdId = String(fd.get('householdId') ?? '');
  const parsed = inviteSchema.safeParse(formObject(fd));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const result = createInvite(user.id, householdId, parsed.data.role, user.plan);
  if (!result.ok) return { ok: false, errors: { _form: result.error } };
  revalidatePath('/app/household');
  return {
    ok: true,
    message: `Invitation created. It expires in ${result.expiresInHours} hours and can only be used once.`,
    // The raw token exists here and nowhere else — only its hash is stored.
    payload: { token: result.token },
  };
}

export async function revokeInviteAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const result = revokeInvite(user.id, String(fd.get('inviteId') ?? ''));
  if (!result.ok) return { ok: false, errors: { _form: result.error } };
  revalidatePath('/app/household');
  return { ok: true, message: 'Invitation revoked. That link no longer works.' };
}

export async function acceptInviteAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const token = String(fd.get('token') ?? '').trim();
  if (!token) return { ok: false, errors: { token: 'Paste the invitation code.' } };

  const limit = rateLimit(`invite:${user.id}`, LIMITS.inviteAccept.limit, LIMITS.inviteAccept.windowMs);
  if (!limit.ok) return { ok: false, errors: { _form: 'Too many attempts. Try again later.' } };

  const preview = previewInvite(token);
  if (!preview.ok) return { ok: false, errors: { token: preview.error } };

  const result = acceptInvite(user.id, token);
  if (!result.ok) return { ok: false, errors: { token: result.error } };
  revalidatePath('/app/household');
  return { ok: true, message: `You have joined “${preview.preview.householdName}” as a ${preview.preview.role}.` };
}

export async function leaveHouseholdAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const result = leaveHousehold(user.id, String(fd.get('householdId') ?? ''));
  if (!result.ok) return { ok: false, errors: { _form: result.error } };
  revalidatePath('/app/household');
  return { ok: true, message: 'You have left the household, and anything you shared into it is no longer shared.' };
}

export async function removeMemberAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const result = removeMember(user.id, String(fd.get('householdId') ?? ''), String(fd.get('memberUserId') ?? ''));
  if (!result.ok) return { ok: false, errors: { _form: result.error } };
  revalidatePath('/app/household');
  return { ok: true, message: 'Member removed. Their access ends on their next request.' };
}

export async function deleteHouseholdAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  if (String(fd.get('confirm') ?? '').trim().toLowerCase() !== 'delete') {
    return { ok: false, errors: { confirm: 'Type delete to confirm.' } };
  }
  const result = deleteHousehold(user.id, String(fd.get('householdId') ?? ''));
  if (!result.ok) return { ok: false, errors: { _form: result.error } };
  revalidatePath('/app/household');
  return { ok: true, message: 'Household deleted. Every share inside it has gone with it.' };
}
