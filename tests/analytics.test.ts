import { beforeEach, describe, expect, it } from 'vitest';
import {
  categoryBreakdown,
  currenciesInUse,
  expiryBuckets,
  merchantSummary,
  metricsFor,
  monthlyRecovery,
  refundStatusBreakdown,
} from '@/lib/analytics';
import { createBenefit, recordBalanceEvent, setBenefitStatus } from '@/lib/benefits';
import { createRefundCase, transitionRefund } from '@/lib/refunds';
import { addDays, todayIso } from '@/lib/dates';
import { makeUser, OFFSETS } from './helpers/factory';

const today = todayIso();
let user: ReturnType<typeof makeUser>;

beforeEach(() => {
  user = makeUser();
});

const sum = (m: Record<string, number>, c = 'INR') => m[c] ?? 0;

describe('the double-counting rule', () => {
  it('a ₹1,000 credit reduced by ₹400 is ₹600 available and ₹400 recovered, never ₹1,600', () => {
    const b = createBenefit({
      userId: user.id,
      title: 'Store credit',
      category: 'store_credit',
      currency: 'INR',
      originalValueMinor: 100_000,
      reminderOffsets: OFFSETS,
    });
    recordBalanceEvent(
      user.id,
      b,
      { type: 'usage', amountMinor: 40_000, reason: 'spent', occurredAt: today },
      OFFSETS,
    );

    const m = metricsFor(user.id, today);
    expect(sum(m.metric('available_reported').byCurrency)).toBe(60_000);
    expect(sum(m.metric('realised_total').byCurrency)).toBe(40_000);
    expect(sum(m.metric('credits_redeemed').byCurrency)).toBe(40_000);

    const available = sum(m.metric('available_reported').byCurrency);
    const realised = sum(m.metric('realised_total').byCurrency);
    expect(available + realised).toBe(100_000); // exactly the original, not more
  });

  it('a received refund moves from pending to recovered rather than appearing in both', () => {
    const rc = createRefundCase({
      userId: user.id,
      merchant: 'Zentra',
      currency: 'INR',
      amountMinor: 200_000,
      checkInDays: 7,
    });
    let m = metricsFor(user.id, today);
    expect(sum(m.metric('pending_refunds').byCurrency)).toBe(200_000);
    expect(sum(m.metric('realised_total').byCurrency)).toBe(0);

    const initiated = transitionRefund(user.id, rc, 'initiated', { checkInDays: 7 });
    if (!initiated.ok) throw new Error('setup');
    const half = transitionRefund(user.id, initiated.refundCase, 'partially_received', {
      receivedNowMinor: 80_000,
      occurredAt: today,
      checkInDays: 7,
    });
    if (!half.ok) throw new Error('setup');

    m = metricsFor(user.id, today);
    expect(sum(m.metric('pending_refunds').byCurrency)).toBe(120_000); // only what is left
    expect(sum(m.metric('refunds_received').byCurrency)).toBe(80_000);
    expect(
      sum(m.metric('pending_refunds').byCurrency) + sum(m.metric('refunds_received').byCurrency),
    ).toBe(200_000);
  });

  it('subset metrics are flagged so the UI cannot add them to their parent', () => {
    const m = metricsFor(user.id, today);
    expect(m.metric('verified_available').subsetOf).toBe('available_reported');
    expect(m.metric('expiring_soon').subsetOf).toBe('available_reported');
    expect(m.metric('refunds_received').subsetOf).toBe('realised_total');
    expect(m.metric('available_reported').subsetOf).toBeUndefined();
  });

  it('every metric carries a definition', () => {
    for (const metric of metricsFor(user.id, today).metrics) {
      expect(metric.description.length).toBeGreaterThan(30);
      expect(metric.label.length).toBeGreaterThan(3);
    }
  });
});

describe('what counts as available', () => {
  it('excludes records past their recorded expiry and reports them separately', () => {
    createBenefit({
      userId: user.id,
      title: 'Expired-ish',
      category: 'gift_card',
      currency: 'INR',
      originalValueMinor: 50_000,
      expiresAt: addDays(today, -1),
      reminderOffsets: OFFSETS,
    });
    createBenefit({
      userId: user.id,
      title: 'Live',
      category: 'gift_card',
      currency: 'INR',
      originalValueMinor: 30_000,
      expiresAt: addDays(today, 10),
      reminderOffsets: OFFSETS,
    });

    const m = metricsFor(user.id, today);
    expect(sum(m.metric('available_reported').byCurrency)).toBe(30_000);
    expect(sum(m.metric('past_expiry').byCurrency)).toBe(50_000);
  });

  it('excludes archived and redeemed records', () => {
    const b = createBenefit({
      userId: user.id,
      title: 'Archived',
      category: 'gift_card',
      currency: 'INR',
      originalValueMinor: 70_000,
      reminderOffsets: OFFSETS,
    });
    setBenefitStatus(user.id, b, 'archived', OFFSETS);
    expect(sum(metricsFor(user.id, today).metric('available_reported').byCurrency)).toBe(0);
  });

  it('counts verified value as a slice of available, not an addition', () => {
    const a = createBenefit({
      userId: user.id,
      title: 'Checked',
      category: 'gift_card',
      currency: 'INR',
      originalValueMinor: 40_000,
      reminderOffsets: OFFSETS,
    });
    createBenefit({
      userId: user.id,
      title: 'Unchecked',
      category: 'gift_card',
      currency: 'INR',
      originalValueMinor: 60_000,
      reminderOffsets: OFFSETS,
    });
    setBenefitStatus(user.id, a, 'available', OFFSETS); // marks it user_confirmed

    const m = metricsFor(user.id, today);
    expect(sum(m.metric('available_reported').byCurrency)).toBe(100_000);
    expect(sum(m.metric('verified_available').byCurrency)).toBe(40_000);
  });
});

describe('currencies', () => {
  it('keeps different currencies apart instead of inventing a rate', () => {
    createBenefit({
      userId: user.id,
      title: 'Rupees',
      category: 'gift_card',
      currency: 'INR',
      originalValueMinor: 100_000,
      reminderOffsets: OFFSETS,
    });
    createBenefit({
      userId: user.id,
      title: 'Dollars',
      category: 'gift_card',
      currency: 'USD',
      originalValueMinor: 5_000,
      reminderOffsets: OFFSETS,
    });

    const available = metricsFor(user.id, today).metric('available_reported').byCurrency;
    expect(available.INR).toBe(100_000);
    expect(available.USD).toBe(5_000);
    expect(Object.keys(available).sort()).toEqual(['INR', 'USD']);
    expect(currenciesInUse(user.id, 'INR')).toEqual(['INR', 'USD']);
  });

  it('charts one currency at a time', () => {
    createBenefit({
      userId: user.id,
      title: 'Rupees',
      category: 'gift_card',
      currency: 'INR',
      originalValueMinor: 100_000,
      reminderOffsets: OFFSETS,
    });
    createBenefit({
      userId: user.id,
      title: 'Dollars',
      category: 'coupon',
      currency: 'USD',
      originalValueMinor: 5_000,
      reminderOffsets: OFFSETS,
    });
    const inr = categoryBreakdown(user.id, 'INR', today);
    expect(inr).toHaveLength(1);
    expect(inr[0]!.category).toBe('gift_card');
  });
});

describe('chart data', () => {
  it('buckets expiry exposure by urgency', () => {
    for (const [days, amount] of [
      [3, 10_000],
      [20, 20_000],
      [60, 30_000],
      [200, 40_000],
    ] as const) {
      createBenefit({
        userId: user.id,
        title: `In ${days}`,
        category: 'gift_card',
        currency: 'INR',
        originalValueMinor: amount,
        expiresAt: addDays(today, days),
        reminderOffsets: OFFSETS,
      });
    }
    const buckets = expiryBuckets(user.id, 'INR', today);
    expect(buckets.map((b) => b.amount)).toEqual([10_000, 20_000, 30_000, 40_000]);
  });

  it('summarises by merchant across benefits and open refunds', () => {
    createBenefit({
      userId: user.id,
      title: 'Credit',
      category: 'store_credit',
      merchant: 'Zentra',
      currency: 'INR',
      originalValueMinor: 25_000,
      reminderOffsets: OFFSETS,
    });
    createRefundCase({
      userId: user.id,
      merchant: 'Zentra',
      currency: 'INR',
      amountMinor: 75_000,
      checkInDays: 7,
    });

    const rows = merchantSummary(user.id, 'INR');
    expect(rows[0]!.merchant).toBe('Zentra');
    expect(rows[0]!.outstanding).toBe(25_000);
    expect(rows[0]!.pendingRefunds).toBe(75_000);
    expect(rows[0]!.total).toBe(100_000);
  });

  it('returns a full 12-month series even when empty', () => {
    const months = monthlyRecovery(user.id, 'INR', 12, today);
    expect(months).toHaveLength(12);
    expect(months.every((m) => m.refunds === 0 && m.credits === 0)).toBe(true);
    expect(months.at(-1)!.month).toBe(today.slice(0, 7));
  });

  it('counts refund cases by status', () => {
    createRefundCase({
      userId: user.id,
      merchant: 'A',
      currency: 'INR',
      amountMinor: 1_000,
      checkInDays: 7,
    });
    createRefundCase({
      userId: user.id,
      merchant: 'B',
      currency: 'INR',
      amountMinor: 2_000,
      checkInDays: 7,
    });
    const rows = refundStatusBreakdown(user.id);
    expect(rows.find((r) => r.status === 'requested')!.count).toBe(2);
  });
});

describe('a brand new account', () => {
  it('reports zeros rather than hiding the section', () => {
    const m = metricsFor(user.id, today);
    expect(m.metrics.every((x) => Object.keys(x.byCurrency).length === 0)).toBe(true);
    expect(m.unresolvedClaims).toBe(0);
    expect(m.upcomingActions).toBe(0);
  });
});
