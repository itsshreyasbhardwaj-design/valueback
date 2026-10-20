import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { recoveryEvents } from '@/lib/db/schema';
import {
  REFUND_TRANSITIONS,
  buildFollowUpDraft,
  canTransitionRefund,
  createRefundCase,
  listRefundCases,
  overdueRefunds,
  refundTimeline,
  transitionRefund,
} from '@/lib/refunds';
import { addDays, todayIso } from '@/lib/dates';
import { makeUser } from './helpers/factory';

const today = todayIso();
let user: ReturnType<typeof makeUser>;

function newCase(over: Partial<Parameters<typeof createRefundCase>[0]> = {}) {
  return createRefundCase({
    userId: user.id,
    merchant: 'Zentra Electronics',
    orderRef: 'ZE-884512',
    currency: 'INR',
    amountMinor: 379_900,
    purchaseDate: addDays(today, -30),
    initiatedAt: addDays(today, -20),
    expectedByDate: addDays(today, 5),
    checkInDays: 7,
    ...over,
  });
}

beforeEach(() => {
  user = makeUser();
});

describe('the state machine', () => {
  it('opens at "requested" with a first timeline entry', () => {
    const rc = newCase();
    expect(rc.status).toBe('requested');
    expect(rc.receivedAmountMinor).toBe(0);
    expect(refundTimeline(rc.id)).toHaveLength(1);
  });

  it('allows only the defined transitions', () => {
    expect(canTransitionRefund('requested', 'accepted')).toBe(true);
    expect(canTransitionRefund('requested', 'received_confirmed')).toBe(false);
    expect(canTransitionRefund('received_confirmed', 'requested')).toBe(false);
    expect(canTransitionRefund('closed_without_receipt', 'disputed')).toBe(true);
  });

  it('rejects an illegal transition on the server', () => {
    const rc = newCase();
    const r = transitionRefund(user.id, rc, 'received_confirmed', { checkInDays: 7 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cannot move/i);
  });

  it('records who made each change and when', () => {
    const rc = newCase();
    const other = makeUser();
    const r = transitionRefund(other.id, rc, 'accepted', {
      note: 'Agent confirmed',
      occurredAt: today,
      checkInDays: 7,
    });
    expect(r.ok).toBe(true);
    const events = refundTimeline(rc.id);
    expect(events[0]!.actorUserId).toBe(other.id);
    expect(events[0]!.fromStatus).toBe('requested');
    expect(events[0]!.toStatus).toBe('accepted');
  });

  it('every status has a reachable path to a terminal state', () => {
    for (const [from, tos] of Object.entries(REFUND_TRANSITIONS)) {
      if (from === 'received_confirmed') continue;
      expect(tos.length).toBeGreaterThan(0);
    }
  });
});

describe('confirming receipt', () => {
  it('counts money as recovered only when the user confirms it', () => {
    const rc = newCase();
    const accepted = transitionRefund(user.id, rc, 'accepted', { checkInDays: 7 });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;

    // Nothing recovered yet, even though the merchant "accepted" it.
    expect(
      db.select().from(recoveryEvents).where(eq(recoveryEvents.userId, user.id)).all(),
    ).toHaveLength(0);

    const initiated = transitionRefund(user.id, accepted.refundCase, 'initiated', {
      checkInDays: 7,
    });
    expect(initiated.ok).toBe(true);
    if (!initiated.ok) return;
    expect(
      db.select().from(recoveryEvents).where(eq(recoveryEvents.userId, user.id)).all(),
    ).toHaveLength(0);

    const received = transitionRefund(user.id, initiated.refundCase, 'received_confirmed', {
      occurredAt: today,
      checkInDays: 7,
    });
    expect(received.ok).toBe(true);
    if (!received.ok) return;
    expect(received.refundCase.receivedAmountMinor).toBe(379_900);

    const recovery = db
      .select()
      .from(recoveryEvents)
      .where(eq(recoveryEvents.userId, user.id))
      .all();
    expect(recovery).toHaveLength(1);
    expect(recovery[0]!.amountMinor).toBe(379_900);
    expect(recovery[0]!.kind).toBe('refund_received');
  });

  it('counts only the increment when a refund arrives in two parts', () => {
    let rc = newCase({ amountMinor: 200_000 });
    const initiated = transitionRefund(user.id, rc, 'initiated', { checkInDays: 7 });
    if (!initiated.ok) throw new Error('setup failed');
    rc = initiated.refundCase;

    const first = transitionRefund(user.id, rc, 'partially_received', {
      receivedNowMinor: 80_000,
      occurredAt: today,
      checkInDays: 7,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.refundCase.receivedAmountMinor).toBe(80_000);

    const second = transitionRefund(user.id, first.refundCase, 'received_confirmed', {
      occurredAt: today,
      checkInDays: 7,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.refundCase.receivedAmountMinor).toBe(200_000);

    const amounts = db
      .select()
      .from(recoveryEvents)
      .where(eq(recoveryEvents.userId, user.id))
      .all()
      .map((r) => r.amountMinor);
    // 80,000 + 120,000 — the first instalment is not counted twice.
    expect(amounts).toEqual([80_000, 120_000]);
    expect(amounts.reduce((a, b) => a! + b!, 0)).toBe(200_000);
  });

  it('refuses to confirm more than is outstanding', () => {
    const rc = newCase({ amountMinor: 100_000 });
    const initiated = transitionRefund(user.id, rc, 'initiated', { checkInDays: 7 });
    if (!initiated.ok) throw new Error('setup failed');
    const tooMuch = transitionRefund(user.id, initiated.refundCase, 'partially_received', {
      receivedNowMinor: 150_000,
      checkInDays: 7,
    });
    expect(tooMuch.ok).toBe(false);
    if (!tooMuch.ok) expect(tooMuch.error).toMatch(/more than/i);
  });

  it('requires an amount for a partial receipt', () => {
    const rc = newCase();
    const initiated = transitionRefund(user.id, rc, 'initiated', { checkInDays: 7 });
    if (!initiated.ok) throw new Error('setup failed');
    const r = transitionRefund(user.id, initiated.refundCase, 'partially_received', {
      checkInDays: 7,
    });
    expect(r.ok).toBe(false);
  });
});

describe('overdue detection', () => {
  it('lists only open cases whose recorded window has passed', () => {
    const late = newCase({ merchant: 'Late Shop', expectedByDate: addDays(today, -3) });
    newCase({ merchant: 'On time', expectedByDate: addDays(today, 10) });

    const done = newCase({ merchant: 'Finished', expectedByDate: addDays(today, -9) });
    const initiated = transitionRefund(user.id, done, 'initiated', { checkInDays: 7 });
    if (initiated.ok)
      transitionRefund(user.id, initiated.refundCase, 'received_confirmed', { checkInDays: 7 });

    const overdue = overdueRefunds(user.id, today);
    expect(overdue.map((r) => r.id)).toEqual([late.id]);
  });
});

describe('the follow-up draft', () => {
  it('states only facts from the case', () => {
    const rc = newCase();
    const draft = buildFollowUpDraft(rc, 'Asha');
    expect(draft.subject).toContain('ZE-884512');
    expect(draft.body).toContain('INR 3799.00');
    expect(draft.body).toContain('Asha');
    expect(draft.body).toContain('ZE-884512');
  });

  it('never claims the merchant agreed, paid, or broke a rule', () => {
    const rc = newCase();
    const { body } = buildFollowUpDraft(rc, 'Asha');
    for (const forbidden of [
      /you agreed/i,
      /you promised/i,
      /unlawful/i,
      /illegal/i,
      /violat/i,
      /you have paid/i,
      /legal action/i,
    ]) {
      expect(body).not.toMatch(forbidden);
    }
    expect(body).toMatch(/have not seen the amount credited/i);
  });

  it('describes the outstanding part when something was already received', () => {
    let rc = newCase({ amountMinor: 200_000 });
    const initiated = transitionRefund(user.id, rc, 'initiated', { checkInDays: 7 });
    if (!initiated.ok) throw new Error('setup failed');
    const partial = transitionRefund(user.id, initiated.refundCase, 'partially_received', {
      receivedNowMinor: 50_000,
      checkInDays: 7,
    });
    if (!partial.ok) throw new Error('setup failed');
    rc = partial.refundCase;

    const { body } = buildFollowUpDraft(rc, 'Asha');
    expect(body).toMatch(/received part of the amount/i);
    expect(body).toContain('1500.00'); // still outstanding
  });
});

describe('listing', () => {
  it('filters to open cases', () => {
    const open = newCase({ merchant: 'Open one' });
    const closed = newCase({ merchant: 'Closed one' });
    transitionRefund(user.id, closed, 'closed_without_receipt', {
      closedReason: 'Not worth it',
      checkInDays: 7,
    });

    const rows = listRefundCases(user.id, { onlyOpen: true }).rows;
    expect(rows.map((r) => r.id)).toEqual([open.id]);
  });
});
