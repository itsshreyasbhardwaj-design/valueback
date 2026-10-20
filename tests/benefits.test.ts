import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { balanceEvents, benefits, recoveryEvents } from '@/lib/db/schema';
import {
  OUTSTANDING_STATUSES,
  applyRecurringAllowances,
  benefitHistory,
  canTransition,
  createBenefit,
  isPastRecordedExpiry,
  listBenefits,
  recomputeBalanceFromLedger,
  recordBalanceEvent,
  setBenefitStatus,
} from '@/lib/benefits';
import { decryptSecret } from '@/lib/crypto';
import { addDays, todayIso } from '@/lib/dates';
import { makeUser, OFFSETS } from './helpers/factory';

const today = todayIso();

function newGiftCard(userId: string, over: Partial<Parameters<typeof createBenefit>[0]> = {}) {
  return createBenefit({
    userId,
    title: 'Store credit',
    category: 'store_credit',
    merchant: 'Lifestyle',
    currency: 'INR',
    originalValueMinor: 100_000, // ₹1,000.00
    expiresAt: addDays(today, 60),
    reminderOffsets: OFFSETS,
    ...over,
  });
}

let user: ReturnType<typeof makeUser>;
beforeEach(() => {
  user = makeUser();
});

describe('creating a benefit', () => {
  it('starts unverified with an opening ledger entry', () => {
    const b = newGiftCard(user.id);
    expect(b.status).toBe('unverified');
    expect(b.evidence).toBe('user_entered');
    expect(b.currentValueMinor).toBe(100_000);

    const history = benefitHistory(b.id);
    expect(history).toHaveLength(1);
    expect(history[0]!.type).toBe('initial');
    expect(history[0]!.resultingValueMinor).toBe(100_000);
  });

  it('allows a benefit with no monetary value at all', () => {
    const b = createBenefit({
      userId: user.id,
      title: 'Free dessert',
      category: 'coupon',
      currency: 'INR',
      reminderOffsets: OFFSETS,
    });
    expect(b.currentValueMinor).toBeNull();
    expect(benefitHistory(b.id)).toHaveLength(0);
  });

  it('encrypts a redemption code and stores only a masked hint in the clear', () => {
    const b = newGiftCard(user.id, { code: 'GC-1234-5678' });
    expect(b.codeHint).toBe('••••5678');
    expect(b.codeCipher).not.toBeNull();
    expect(b.codeCipher).not.toContain('1234');
    expect(decryptSecret(b.codeCipher!)).toBe('GC-1234-5678');
  });

  it('tracks units for non-monetary packages', () => {
    const b = createBenefit({
      userId: user.id,
      title: 'Yoga pack',
      category: 'prepaid_service',
      currency: 'INR',
      unitLabel: 'classes',
      originalUnits: 10,
      reminderOffsets: OFFSETS,
    });
    expect(b.currentUnits).toBe(10);
  });
});

describe('recording usage', () => {
  it('reduces the balance and records the used amount as recovered — never both', () => {
    const b = newGiftCard(user.id);
    const result = recordBalanceEvent(
      user.id,
      b,
      { type: 'usage', amountMinor: 40_000, reason: 'Spent in store', occurredAt: today },
      OFFSETS,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.benefit.currentValueMinor).toBe(60_000);
    expect(result.benefit.status).toBe('partially_used');

    const recovery = db
      .select()
      .from(recoveryEvents)
      .where(eq(recoveryEvents.benefitId, b.id))
      .all();
    expect(recovery).toHaveLength(1);
    expect(recovery[0]!.kind).toBe('credit_redeemed');
    expect(recovery[0]!.amountMinor).toBe(40_000);

    // The ₹1,000 original is gone from the outstanding figure entirely.
    const fresh = db.select().from(benefits).where(eq(benefits.id, b.id)).get()!;
    expect(fresh.currentValueMinor! + recovery[0]!.amountMinor!).toBe(100_000);
  });

  it('keeps the cached balance identical to the ledger after many events', () => {
    let b = newGiftCard(user.id);
    for (const amount of [10_000, 5_000, 1_234, 50]) {
      const r = recordBalanceEvent(
        user.id,
        b,
        { type: 'usage', amountMinor: amount, reason: 'x', occurredAt: today },
        OFFSETS,
      );
      expect(r.ok).toBe(true);
      if (r.ok) b = r.benefit;
    }
    expect(b.currentValueMinor).toBe(100_000 - 16_284);
    expect(recomputeBalanceFromLedger(b.id).value).toBe(b.currentValueMinor);
  });

  it('refuses to spend more than remains', () => {
    const b = newGiftCard(user.id);
    const r = recordBalanceEvent(
      user.id,
      b,
      { type: 'usage', amountMinor: 200_000, reason: '', occurredAt: today },
      OFFSETS,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/more than the remaining/i);
    expect(db.select().from(benefits).where(eq(benefits.id, b.id)).get()!.currentValueMinor).toBe(
      100_000,
    );
  });

  it('refuses zero and negative usage', () => {
    const b = newGiftCard(user.id);
    expect(
      recordBalanceEvent(
        user.id,
        b,
        { type: 'usage', amountMinor: 0, reason: '', occurredAt: today },
        OFFSETS,
      ).ok,
    ).toBe(false);
    expect(
      recordBalanceEvent(
        user.id,
        b,
        { type: 'usage', amountMinor: -500, reason: '', occurredAt: today },
        OFFSETS,
      ).ok,
    ).toBe(false);
  });

  it('marks a fully-spent record as redeemed', () => {
    const b = newGiftCard(user.id);
    const r = recordBalanceEvent(
      user.id,
      b,
      { type: 'usage', amountMinor: 100_000, reason: '', occurredAt: today },
      OFFSETS,
    );
    expect(r.ok && r.benefit.status).toBe('redeemed');
  });

  it('consumes units and logs them separately from money', () => {
    const pack = createBenefit({
      userId: user.id,
      title: 'Yoga',
      category: 'prepaid_service',
      currency: 'INR',
      originalValueMinor: 600_000,
      unitLabel: 'classes',
      originalUnits: 10,
      reminderOffsets: OFFSETS,
    });
    const r = recordBalanceEvent(
      user.id,
      pack,
      { type: 'usage', units: 3, amountMinor: 180_000, reason: 'Three classes', occurredAt: today },
      OFFSETS,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.benefit.currentUnits).toBe(7);
    expect(r.benefit.currentValueMinor).toBe(420_000);

    const kinds = db
      .select()
      .from(recoveryEvents)
      .where(eq(recoveryEvents.benefitId, pack.id))
      .all()
      .map((e) => e.kind);
    expect(kinds).toContain('credit_redeemed');
    expect(kinds).toContain('units_consumed');
  });
});

describe('corrections and verification', () => {
  it('a correction changes the balance without claiming anything was recovered', () => {
    const b = newGiftCard(user.id);
    const r = recordBalanceEvent(
      user.id,
      b,
      { type: 'correction', newValueMinor: 70_000, reason: 'I typed it wrong', occurredAt: today },
      OFFSETS,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.benefit.currentValueMinor).toBe(70_000);
    expect(
      db.select().from(recoveryEvents).where(eq(recoveryEvents.benefitId, b.id)).all(),
    ).toHaveLength(0);
  });

  it('a verified balance update records evidence but is not a recovery either', () => {
    const b = newGiftCard(user.id);
    const r = recordBalanceEvent(
      user.id,
      b,
      {
        type: 'verified_update',
        newValueMinor: 80_000,
        reason: 'Checked on their site',
        occurredAt: today,
      },
      OFFSETS,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.benefit.evidence).toBe('reverified');
    expect(r.benefit.verifiedAt).toBe(today);
    expect(r.benefit.status).toBe('available');
    expect(
      db.select().from(recoveryEvents).where(eq(recoveryEvents.benefitId, b.id)).all(),
    ).toHaveLength(0);
  });

  it('never rewrites history — every change appends', () => {
    const b = newGiftCard(user.id);
    recordBalanceEvent(
      user.id,
      b,
      { type: 'usage', amountMinor: 10_000, reason: 'a', occurredAt: today },
      OFFSETS,
    );
    const after = db.select().from(benefits).where(eq(benefits.id, b.id)).get()!;
    recordBalanceEvent(
      user.id,
      after,
      { type: 'correction', newValueMinor: 95_000, reason: 'b', occurredAt: today },
      OFFSETS,
    );

    const rows = db.select().from(balanceEvents).where(eq(balanceEvents.benefitId, b.id)).all();
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.type).sort()).toEqual(['correction', 'initial', 'usage']);
  });
});

describe('expiry and revalidation', () => {
  it('does not change status just because a date passed', () => {
    const b = newGiftCard(user.id, { expiresAt: addDays(today, -5) });
    expect(b.status).toBe('unverified');
    expect(OUTSTANDING_STATUSES).toContain(b.status);
    expect(isPastRecordedExpiry(b, today)).toBe(true);
  });

  it('revalidation moves the date and reopens an expired record', () => {
    const b = newGiftCard(user.id, { expiresAt: addDays(today, -5) });
    const expired = setBenefitStatus(user.id, b, 'expired_per_terms', OFFSETS);
    expect(expired.ok).toBe(true);
    if (!expired.ok) return;

    const r = recordBalanceEvent(
      user.id,
      expired.benefit,
      {
        type: 'revalidation',
        newExpiresAt: addDays(today, 90),
        reason: 'Support extended it',
        occurredAt: today,
      },
      OFFSETS,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.benefit.status).toBe('available');
    expect(r.benefit.expiresAt).toBe(addDays(today, 90));
    expect(r.benefit.evidence).toBe('reverified');
  });
});

describe('status transitions', () => {
  it('allows sensible moves and blocks nonsense', () => {
    expect(canTransition('unverified', 'available')).toBe(true);
    expect(canTransition('available', 'archived')).toBe(true);
    expect(canTransition('redeemed', 'partially_used')).toBe(false);
    expect(canTransition('invalid', 'partially_used')).toBe(false);
  });

  it('rejects an illegal transition at the service layer, not just in the UI', () => {
    const b = newGiftCard(user.id);
    const redeemed = setBenefitStatus(user.id, b, 'available', OFFSETS);
    expect(redeemed.ok).toBe(true);
    if (!redeemed.ok) return;
    const bad = setBenefitStatus(
      user.id,
      { ...redeemed.benefit, status: 'redeemed' },
      'partially_used',
      OFFSETS,
    );
    expect(bad.ok).toBe(false);
  });

  it('marking available from unverified records that the user confirmed it', () => {
    const b = newGiftCard(user.id);
    const r = setBenefitStatus(user.id, b, 'available', OFFSETS);
    expect(r.ok && r.benefit.evidence).toBe('user_confirmed');
    expect(r.ok && r.benefit.verifiedAt).toBe(today);
  });
});

describe('listing and filtering', () => {
  it('separates active from archived', () => {
    const a = newGiftCard(user.id, { title: 'Active one' });
    const b = newGiftCard(user.id, { title: 'Archived one' });
    setBenefitStatus(user.id, b, 'archived', OFFSETS);

    expect(listBenefits(user.id).rows.map((r) => r.id)).toEqual([a.id]);
    expect(listBenefits(user.id, { onlyArchived: true }).rows.map((r) => r.id)).toEqual([b.id]);
    expect(listBenefits(user.id, { includeArchived: true }).total).toBe(2);
  });

  it('filters by expiry window and never matches an encrypted code', () => {
    newGiftCard(user.id, { title: 'Soon', expiresAt: addDays(today, 5) });
    newGiftCard(user.id, { title: 'Later', expiresAt: addDays(today, 200), code: 'SECRET-9999' });

    expect(listBenefits(user.id, { expiringWithinDays: 30 }).rows.map((r) => r.title)).toEqual([
      'Soon',
    ]);
    expect(listBenefits(user.id, { q: 'SECRET-9999' }).total).toBe(0);
    expect(listBenefits(user.id, { q: 'later' }).total).toBe(1);
  });
});

describe('recurring allowances', () => {
  it('tops up once per period and not again on a repeat run', () => {
    const pack = createBenefit({
      userId: user.id,
      title: 'Monthly credits',
      category: 'membership_credit',
      currency: 'INR',
      unitLabel: 'credits',
      originalUnits: 0,
      recurrence: 'monthly',
      recurrenceUnits: 4,
      recurrenceAnchor: addDays(today, -40),
      reminderOffsets: OFFSETS,
    });

    expect(applyRecurringAllowances(user.id, today)).toBe(1);
    expect(db.select().from(benefits).where(eq(benefits.id, pack.id)).get()!.currentUnits).toBe(4);

    expect(applyRecurringAllowances(user.id, today)).toBe(0);
    expect(db.select().from(benefits).where(eq(benefits.id, pack.id)).get()!.currentUnits).toBe(4);
  });
});
