import 'server-only';
import { and, asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from './db';
import {
  benefits,
  notifications,
  refundCases,
  reminders,
  userSettings,
  type ReminderKind,
} from './db/schema';
import { addDays, daysBetween, todayIso } from './dates';
import { newId } from './ids';
import { formatMoney } from './money';

export const DEFAULT_OFFSETS = [30, 14, 7, 3, 1];

export function parseOffsets(json: string): number[] {
  try {
    const v: unknown = JSON.parse(json);
    if (!Array.isArray(v)) return DEFAULT_OFFSETS;
    const nums = v.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 365);
    return nums.length ? [...new Set(nums)].sort((a, b) => b - a) : DEFAULT_OFFSETS;
  } catch {
    return DEFAULT_OFFSETS;
  }
}

function upsertReminder(row: {
  userId: string;
  benefitId?: string | null;
  refundCaseId?: string | null;
  kind: ReminderKind;
  label: string;
  dueAt: string;
  offsetDays?: number | null;
  dedupeKey: string;
}) {
  // The unique (user_id, dedupe_key) index makes a re-run a no-op rather than a
  // second reminder — this is what keeps the scheduler idempotent.
  db.insert(reminders)
    .values({ id: newId('r_'), ...row })
    .onConflictDoNothing()
    .run();
}

/**
 * Rebuild the expiry reminder set for one benefit.
 * Only future dates are scheduled; already-handled reminders (done/snoozed) are
 * left alone so a save does not resurrect something the user dismissed.
 */
export function syncExpiryReminders(
  userId: string,
  benefit: {
    id: string;
    title: string;
    expiresAt: string | null;
    archivedAt: string | null;
    status: string;
  },
  offsets: number[],
  today = todayIso(),
): void {
  const stale = db
    .select({ id: reminders.id })
    .from(reminders)
    .where(
      and(
        eq(reminders.benefitId, benefit.id),
        eq(reminders.kind, 'expiry'),
        eq(reminders.status, 'scheduled'),
      ),
    )
    .all();
  if (stale.length) {
    db.delete(reminders)
      .where(
        inArray(
          reminders.id,
          stale.map((s) => s.id),
        ),
      )
      .run();
  }

  const inactive = ['redeemed', 'invalid', 'archived', 'expired_per_terms'];
  if (!benefit.expiresAt || benefit.archivedAt || inactive.includes(benefit.status)) return;

  for (const offset of offsets) {
    const dueAt = addDays(benefit.expiresAt, -offset);
    if (daysBetween(today, dueAt) < 0) continue;
    upsertReminder({
      userId,
      benefitId: benefit.id,
      kind: 'expiry',
      label: `${benefit.title} expires in ${offset} day${offset === 1 ? '' : 's'}`,
      dueAt,
      offsetDays: offset,
      dedupeKey: `expiry:${benefit.id}:${dueAt}`,
    });
  }
}

/** One rolling check-in for an open refund case. */
export function syncRefundCheckIn(
  userId: string,
  rc: {
    id: string;
    merchant: string;
    status: string;
    expectedByDate: string | null;
    archivedAt: string | null;
  },
  checkInDays: number,
  today = todayIso(),
): void {
  const open = [
    'requested',
    'accepted',
    'initiated',
    'awaiting_receipt',
    'partially_received',
    'disputed',
  ];
  const stale = db
    .select({ id: reminders.id })
    .from(reminders)
    .where(
      and(
        eq(reminders.refundCaseId, rc.id),
        eq(reminders.kind, 'refund_check_in'),
        eq(reminders.status, 'scheduled'),
      ),
    )
    .all();
  if (stale.length) {
    db.delete(reminders)
      .where(
        inArray(
          reminders.id,
          stale.map((s) => s.id),
        ),
      )
      .run();
  }
  if (rc.archivedAt || !open.includes(rc.status)) return;

  // A window that has already passed deserves a nudge now, not in a week.
  const dueAt = rc.expectedByDate
    ? daysBetween(today, rc.expectedByDate) >= 0
      ? addDays(rc.expectedByDate, 1)
      : today
    : addDays(today, Math.max(1, checkInDays));
  upsertReminder({
    userId,
    refundCaseId: rc.id,
    kind: 'refund_check_in',
    label: `Check on the refund from ${rc.merchant}`,
    dueAt,
    dedupeKey: `refund:${rc.id}:${dueAt}`,
  });
}

export function createCustomReminder(input: {
  userId: string;
  benefitId?: string | null;
  refundCaseId?: string | null;
  kind: ReminderKind;
  label: string;
  dueAt: string;
}): void {
  upsertReminder({
    ...input,
    dedupeKey: `${input.kind}:${input.benefitId ?? input.refundCaseId ?? 'none'}:${input.dueAt}:${input.label.slice(0, 40)}`,
  });
}

export function snoozeReminder(userId: string, id: string, days: number, today = todayIso()) {
  const until = addDays(today, Math.max(1, days));
  db.update(reminders)
    .set({ status: 'snoozed', snoozedUntil: until, dueAt: until })
    .where(and(eq(reminders.id, id), eq(reminders.userId, userId)))
    .run();
}

export function completeReminder(userId: string, id: string) {
  db.update(reminders)
    .set({ status: 'done' })
    .where(and(eq(reminders.id, id), eq(reminders.userId, userId)))
    .run();
}

export function rescheduleReminder(userId: string, id: string, dueAt: string) {
  db.update(reminders)
    .set({ dueAt, status: 'scheduled', snoozedUntil: null })
    .where(and(eq(reminders.id, id), eq(reminders.userId, userId)))
    .run();
}

export function cancelReminder(userId: string, id: string) {
  db.update(reminders)
    .set({ status: 'cancelled' })
    .where(and(eq(reminders.id, id), eq(reminders.userId, userId)))
    .run();
}

export function dueReminders(userId: string, today = todayIso()) {
  return db
    .select()
    .from(reminders)
    .where(
      and(
        eq(reminders.userId, userId),
        inArray(reminders.status, ['scheduled', 'snoozed']),
        lte(reminders.dueAt, today),
      ),
    )
    .orderBy(asc(reminders.dueAt))
    .all();
}

export function upcomingReminders(userId: string, withinDays = 60, today = todayIso()) {
  return db
    .select()
    .from(reminders)
    .where(
      and(
        eq(reminders.userId, userId),
        inArray(reminders.status, ['scheduled', 'snoozed']),
        lte(reminders.dueAt, addDays(today, withinDays)),
      ),
    )
    .orderBy(asc(reminders.dueAt))
    .all();
}

/**
 * Fire every reminder that is due and has not already produced a notification.
 *
 * Safe to run repeatedly: notifications carry a unique (user, dedupe_key), so a
 * second run on the same day creates nothing. Pass `userId` to process one
 * account — the in-app sweep does, so using the app never fires notifications
 * for a different account on the same installation. The CLI runs it unscoped.
 */
export function runDueReminders(
  today = todayIso(),
  userId?: string,
): { fired: number; scanned: number } {
  const conditions = [
    inArray(reminders.status, ['scheduled', 'snoozed'] as const),
    lte(reminders.dueAt, today),
    or(isNull(reminders.snoozedUntil), lte(reminders.snoozedUntil, today)),
  ];
  if (userId) conditions.push(eq(reminders.userId, userId));

  const due = db
    .select()
    .from(reminders)
    .where(and(...conditions))
    .all();

  let fired = 0;
  for (const r of due) {
    const inApp = db
      .select({ v: userSettings.notifyInApp })
      .from(userSettings)
      .where(eq(userSettings.userId, r.userId))
      .get();
    if (inApp && inApp.v === false) {
      db.update(reminders)
        .set({ status: 'fired', lastFiredAt: today })
        .where(eq(reminders.id, r.id))
        .run();
      continue;
    }

    const body = reminderBody(r);
    const res = db
      .insert(notifications)
      .values({
        id: newId('n_'),
        userId: r.userId,
        reminderId: r.id,
        benefitId: r.benefitId,
        refundCaseId: r.refundCaseId,
        title: r.label || 'Reminder',
        body,
        severity: r.kind === 'expiry' && (r.offsetDays ?? 99) <= 7 ? 'urgent' : 'warning',
        dedupeKey: `rem:${r.id}:${r.dueAt}`,
      })
      .onConflictDoNothing()
      .run();
    if (res.changes > 0) fired += 1;
    db.update(reminders)
      .set({ status: 'fired', lastFiredAt: today, snoozedUntil: null })
      .where(eq(reminders.id, r.id))
      .run();
  }
  return { fired, scanned: due.length };
}

function reminderBody(r: typeof reminders.$inferSelect): string {
  if (r.benefitId) {
    const b = db
      .select({
        title: benefits.title,
        value: benefits.currentValueMinor,
        currency: benefits.currency,
        expiresAt: benefits.expiresAt,
      })
      .from(benefits)
      .where(eq(benefits.id, r.benefitId))
      .get();
    if (!b) return '';
    const amount = b.value != null ? `${formatMoney(b.value, b.currency)} ` : '';
    return `${amount}recorded against ${b.title}. Recorded expiry: ${b.expiresAt ?? 'not set'}.`;
  }
  if (r.refundCaseId) {
    const rc = db
      .select({
        merchant: refundCases.merchant,
        amount: refundCases.amountMinor,
        currency: refundCases.currency,
      })
      .from(refundCases)
      .where(eq(refundCases.id, r.refundCaseId))
      .get();
    if (!rc) return '';
    return `${formatMoney(rc.amount, rc.currency)} expected from ${rc.merchant}. Not yet confirmed as received.`;
  }
  return '';
}

export function unreadNotificationCount(userId: string): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .get();
  return row?.n ?? 0;
}
