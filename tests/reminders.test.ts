import { beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { notifications, reminders, userSettings } from '@/lib/db/schema';
import {
  completeReminder,
  createCustomReminder,
  dueReminders,
  parseOffsets,
  runDueReminders,
  snoozeReminder,
  syncExpiryReminders,
  syncRefundCheckIn,
  unreadNotificationCount,
  upcomingReminders,
} from '@/lib/reminders';
import { createBenefit, setBenefitStatus } from '@/lib/benefits';
import { createRefundCase } from '@/lib/refunds';
import { addDays, todayIso } from '@/lib/dates';
import { makeUser, OFFSETS } from './helpers/factory';

const today = todayIso();
let user: ReturnType<typeof makeUser>;

beforeEach(() => {
  user = makeUser();
});

describe('offset parsing', () => {
  it('falls back to the defaults for junk input', () => {
    expect(parseOffsets('[30,14,7,3,1]')).toEqual([30, 14, 7, 3, 1]);
    expect(parseOffsets('nonsense')).toEqual([30, 14, 7, 3, 1]);
    expect(parseOffsets('[]')).toEqual([30, 14, 7, 3, 1]);
  });

  it('sorts, de-duplicates and drops out-of-range values', () => {
    expect(parseOffsets('[7,7,30,-5,9999,1]')).toEqual([30, 7, 1]);
  });
});

describe('scheduling from an expiry date', () => {
  it('creates one reminder per future offset', () => {
    createBenefit({
      userId: user.id,
      title: 'Expiring soon',
      category: 'gift_card',
      currency: 'INR',
      originalValueMinor: 10_000,
      expiresAt: addDays(today, 40),
      reminderOffsets: OFFSETS,
    });
    const rows = db.select().from(reminders).where(eq(reminders.userId, user.id)).all();
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.dueAt).sort()).toEqual(
      [30, 14, 7, 3, 1].map((o) => addDays(addDays(today, 40), -o)).sort(),
    );
  });

  it('skips offsets that are already in the past', () => {
    createBenefit({
      userId: user.id,
      title: 'Expires in 5 days',
      category: 'gift_card',
      currency: 'INR',
      expiresAt: addDays(today, 5),
      reminderOffsets: OFFSETS,
    });
    const rows = db.select().from(reminders).where(eq(reminders.userId, user.id)).all();
    expect(rows.map((r) => r.offsetDays).sort((a, b) => (b ?? 0) - (a ?? 0))).toEqual([3, 1]);
  });

  it('creates nothing without an expiry date', () => {
    createBenefit({
      userId: user.id,
      title: 'No date',
      category: 'coupon',
      currency: 'INR',
      reminderOffsets: OFFSETS,
    });
    expect(db.select().from(reminders).where(eq(reminders.userId, user.id)).all()).toHaveLength(0);
  });

  it('clears scheduled reminders when a record is archived', () => {
    const b = createBenefit({
      userId: user.id,
      title: 'Archive me',
      category: 'gift_card',
      currency: 'INR',
      expiresAt: addDays(today, 40),
      reminderOffsets: OFFSETS,
    });
    expect(db.select().from(reminders).where(eq(reminders.benefitId, b.id)).all().length).toBe(5);
    setBenefitStatus(user.id, b, 'archived', OFFSETS);
    expect(db.select().from(reminders).where(eq(reminders.benefitId, b.id)).all()).toHaveLength(0);
  });

  it('re-syncing is idempotent rather than cumulative', () => {
    const b = createBenefit({
      userId: user.id,
      title: 'Stable',
      category: 'gift_card',
      currency: 'INR',
      expiresAt: addDays(today, 40),
      reminderOffsets: OFFSETS,
    });
    for (let i = 0; i < 5; i++) syncExpiryReminders(user.id, b, OFFSETS, today);
    expect(db.select().from(reminders).where(eq(reminders.benefitId, b.id)).all()).toHaveLength(5);
  });
});

describe('refund check-ins', () => {
  it('nudges immediately when the recorded window has already passed', () => {
    const rc = createRefundCase({
      userId: user.id,
      merchant: 'Late',
      currency: 'INR',
      amountMinor: 10_000,
      expectedByDate: addDays(today, -3),
      checkInDays: 7,
    });
    const row = db.select().from(reminders).where(eq(reminders.refundCaseId, rc.id)).get()!;
    expect(row.dueAt).toBe(today);
  });

  it('waits until the day after the window when it is still open', () => {
    const rc = createRefundCase({
      userId: user.id,
      merchant: 'Soon',
      currency: 'INR',
      amountMinor: 10_000,
      expectedByDate: addDays(today, 10),
      checkInDays: 7,
    });
    const row = db.select().from(reminders).where(eq(reminders.refundCaseId, rc.id)).get()!;
    expect(row.dueAt).toBe(addDays(today, 11));
  });

  it('falls back to the user’s check-in interval with no expected date', () => {
    const rc = createRefundCase({
      userId: user.id,
      merchant: 'Unknown window',
      currency: 'INR',
      amountMinor: 10_000,
      checkInDays: 5,
    });
    const row = db.select().from(reminders).where(eq(reminders.refundCaseId, rc.id)).get()!;
    expect(row.dueAt).toBe(addDays(today, 5));
  });

  it('does not schedule for a closed case', () => {
    const rc = createRefundCase({
      userId: user.id,
      merchant: 'Closed',
      currency: 'INR',
      amountMinor: 10_000,
      checkInDays: 7,
    });
    syncRefundCheckIn(user.id, { ...rc, status: 'received_confirmed' }, 7, today);
    expect(db.select().from(reminders).where(eq(reminders.refundCaseId, rc.id)).all()).toHaveLength(
      0,
    );
  });
});

describe('running the scheduler', () => {
  function dueReminder() {
    createCustomReminder({
      userId: user.id,
      kind: 'custom',
      label: 'Chase the shop',
      dueAt: today,
    });
  }

  it('scopes to one account so other accounts are untouched', () => {
    const stranger = makeUser();
    createCustomReminder({ userId: stranger.id, kind: 'custom', label: 'Theirs', dueAt: today });
    dueReminder();
    const scoped = runDueReminders(today, user.id);
    expect(scoped.scanned).toBe(1);
    expect(unreadNotificationCount(stranger.id)).toBe(0);
  });

  it('turns a due reminder into exactly one notification', () => {
    dueReminder();
    const first = runDueReminders(today, user.id);
    expect(first.scanned).toBe(1);
    expect(first.fired).toBe(1);
    expect(unreadNotificationCount(user.id)).toBe(1);
  });

  it('is idempotent — running it again creates nothing', () => {
    dueReminder();
    runDueReminders(today, user.id);
    const second = runDueReminders(today, user.id);
    expect(second.fired).toBe(0);
    expect(
      db.select().from(notifications).where(eq(notifications.userId, user.id)).all(),
    ).toHaveLength(1);
  });

  it('ignores reminders that are not due yet', () => {
    createCustomReminder({
      userId: user.id,
      kind: 'custom',
      label: 'Later',
      dueAt: addDays(today, 3),
    });
    expect(runDueReminders(today, user.id).scanned).toBe(0);
    expect(unreadNotificationCount(user.id)).toBe(0);
  });

  it('respects the in-app notification preference', () => {
    db.update(userSettings)
      .set({ notifyInApp: false })
      .where(eq(userSettings.userId, user.id))
      .run();
    dueReminder();
    const result = runDueReminders(today, user.id);
    expect(result.scanned).toBe(1);
    expect(result.fired).toBe(0);
    expect(unreadNotificationCount(user.id)).toBe(0);
  });

  it('does not re-fire a snoozed reminder until the snooze is over', () => {
    dueReminder();
    const r = db.select().from(reminders).where(eq(reminders.userId, user.id)).get()!;
    snoozeReminder(user.id, r.id, 7, today);

    expect(runDueReminders(today, user.id).scanned).toBe(0);
    expect(runDueReminders(addDays(today, 7), user.id).scanned).toBe(1);
  });

  it('skips a reminder marked done', () => {
    dueReminder();
    const r = db.select().from(reminders).where(eq(reminders.userId, user.id)).get()!;
    completeReminder(user.id, r.id);
    expect(runDueReminders(today, user.id).scanned).toBe(0);
  });

  it('cannot be used to complete someone else’s reminder', () => {
    dueReminder();
    const stranger = makeUser();
    const r = db.select().from(reminders).where(eq(reminders.userId, user.id)).get()!;
    completeReminder(stranger.id, r.id);
    expect(db.select().from(reminders).where(eq(reminders.id, r.id)).get()!.status).toBe(
      'scheduled',
    );
  });
});

describe('queries', () => {
  it('separates due from upcoming', () => {
    createCustomReminder({ userId: user.id, kind: 'custom', label: 'Now', dueAt: today });
    createCustomReminder({
      userId: user.id,
      kind: 'custom',
      label: 'Soon',
      dueAt: addDays(today, 10),
    });
    createCustomReminder({
      userId: user.id,
      kind: 'custom',
      label: 'Far',
      dueAt: addDays(today, 200),
    });

    expect(dueReminders(user.id, today).map((r) => r.label)).toEqual(['Now']);
    expect(upcomingReminders(user.id, 60, today).map((r) => r.label)).toEqual(['Now', 'Soon']);
  });

  it('counts only this user’s unread notifications', () => {
    const stranger = makeUser();
    createCustomReminder({ userId: user.id, kind: 'custom', label: 'Mine', dueAt: today });
    createCustomReminder({ userId: stranger.id, kind: 'custom', label: 'Theirs', dueAt: today });
    runDueReminders(today); // unscoped, as the CLI runs it

    expect(unreadNotificationCount(user.id)).toBe(1);
    expect(unreadNotificationCount(stranger.id)).toBe(1);
    expect(
      db
        .select()
        .from(notifications)
        .where(and(eq(notifications.userId, user.id)))
        .all(),
    ).toHaveLength(1);
  });
});
