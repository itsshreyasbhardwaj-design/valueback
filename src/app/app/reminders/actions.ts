'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { notifications } from '@/lib/db/schema';
import { requireUserForAction } from '@/lib/auth';
import {
  cancelReminder,
  completeReminder,
  createCustomReminder,
  rescheduleReminder,
  runDueReminders,
  snoozeReminder,
} from '@/lib/reminders';
import { nowIso, todayIso } from '@/lib/dates';
import { fieldErrors, formObject, reminderSchema, type FormState } from '@/lib/validation';

export async function snoozeReminderAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const days = Number(fd.get('days') ?? 7);
  snoozeReminder(
    user.id,
    String(fd.get('id') ?? ''),
    Number.isFinite(days) ? days : 7,
    todayIso(user.settings.timeZone),
  );
  revalidatePath('/app/reminders');
  return { ok: true, message: `Snoozed for ${days} days.` };
}

export async function completeReminderAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  completeReminder(user.id, String(fd.get('id') ?? ''));
  revalidatePath('/app/reminders');
  return { ok: true, message: 'Marked as done.' };
}

export async function cancelReminderAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  cancelReminder(user.id, String(fd.get('id') ?? ''));
  revalidatePath('/app/reminders');
  return { ok: true, message: 'Reminder cancelled.' };
}

export async function rescheduleReminderAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const dueAt = String(fd.get('dueAt') ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueAt)) return { ok: false, errors: { dueAt: 'Choose a date.' } };
  rescheduleReminder(user.id, String(fd.get('id') ?? ''), dueAt);
  revalidatePath('/app/reminders');
  return { ok: true, message: 'Rescheduled.' };
}

export async function createReminderAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const parsed = reminderSchema.safeParse(formObject(fd));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  createCustomReminder({
    userId: user.id,
    kind: parsed.data.kind,
    label: parsed.data.label,
    dueAt: parsed.data.dueAt,
    benefitId: parsed.data.benefitId || null,
    refundCaseId: parsed.data.refundCaseId || null,
  });
  revalidatePath('/app/reminders');
  return { ok: true, message: 'Reminder scheduled.' };
}

export async function markNotificationReadAction(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const user = await requireUserForAction();
  const id = String(fd.get('id') ?? '');
  db.update(notifications)
    .set({ readAt: nowIso() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)))
    .run();
  revalidatePath('/app/reminders');
  revalidatePath('/app');
  return { ok: true };
}

export async function markAllReadAction(): Promise<void> {
  const user = await requireUserForAction();
  db.update(notifications)
    .set({ readAt: nowIso() })
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)))
    .run();
  revalidatePath('/app/reminders');
  revalidatePath('/app');
}

/** Runs the scheduler on demand so a user can see exactly what is due now. */
export async function runSchedulerAction(_prev: FormState, _fd: FormData): Promise<FormState> {
  const user = await requireUserForAction();
  const result = runDueReminders(todayIso(user.settings.timeZone), user.id);
  revalidatePath('/app/reminders');
  revalidatePath('/app');
  return {
    ok: true,
    message:
      result.fired > 0
        ? `${result.fired} new ${result.fired === 1 ? 'notification' : 'notifications'} created from ${result.scanned} due ${result.scanned === 1 ? 'reminder' : 'reminders'}.`
        : `Checked ${result.scanned} due ${result.scanned === 1 ? 'reminder' : 'reminders'} — nothing new to tell you. Running this again will not create duplicates.`,
  };
}
