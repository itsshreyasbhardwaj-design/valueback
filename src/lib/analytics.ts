import 'server-only';
import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { db } from './db';
import { benefits, recoveryEvents, refundCases, reminders } from './db/schema';
import { OPEN_REFUND_STATUSES } from './refunds';
import { OUTSTANDING_STATUSES } from './benefits';
import { addDays, monthKey, todayIso } from './dates';
import { visibleBenefitWhere, visibleRefundWhere } from './authz';

/**
 * Amounts are kept in a map keyed by currency. Nothing in this file ever adds
 * two different currencies together — there is no rate source, so a combined
 * figure would be a guess presented as a fact.
 */
export type ByCurrency = Record<string, number>;

export type Metric = {
  key: string;
  label: string;
  /** shown in the UI next to the number; also the canonical definition */
  description: string;
  byCurrency: ByCurrency;
  count: number;
  /** when set, this metric is a slice of another one and must not be added to it */
  subsetOf?: string;
  tone: 'neutral' | 'positive' | 'warning';
};

function add(target: ByCurrency, currency: string, amount: number | null | undefined) {
  if (amount == null) return;
  target[currency] = (target[currency] ?? 0) + amount;
}

export function metricsFor(userId: string, today = todayIso()) {
  const soonCutoff = addDays(today, 30);

  const outstandingRows = db
    .select({
      currency: benefits.currency,
      value: benefits.currentValueMinor,
      units: benefits.currentUnits,
      evidence: benefits.evidence,
      expiresAt: benefits.expiresAt,
      category: benefits.category,
      merchant: benefits.merchant,
    })
    .from(benefits)
    .where(
      and(
        visibleBenefitWhere(userId),
        isNull(benefits.archivedAt),
        inArray(benefits.status, OUTSTANDING_STATUSES),
      ),
    )
    .all();

  const available: ByCurrency = {};
  const verified: ByCurrency = {};
  const expiringSoon: ByCurrency = {};
  const pastExpiry: ByCurrency = {};
  let availableCount = 0;
  let verifiedCount = 0;
  let expiringCount = 0;
  let pastExpiryCount = 0;
  let outstandingUnits = 0;

  for (const r of outstandingRows) {
    const isPast = Boolean(r.expiresAt && r.expiresAt < today);
    if (isPast) {
      add(pastExpiry, r.currency, r.value);
      pastExpiryCount += 1;
      continue; // deliberately NOT part of "available"
    }
    add(available, r.currency, r.value);
    availableCount += 1;
    outstandingUnits += r.units ?? 0;
    if (r.evidence === 'user_confirmed' || r.evidence === 'reverified') {
      add(verified, r.currency, r.value);
      verifiedCount += 1;
    }
    if (r.expiresAt && r.expiresAt <= soonCutoff) {
      add(expiringSoon, r.currency, r.value);
      expiringCount += 1;
    }
  }

  const openRefunds = db
    .select({
      currency: refundCases.currency,
      amount: refundCases.amountMinor,
      received: refundCases.receivedAmountMinor,
    })
    .from(refundCases)
    .where(
      and(
        visibleRefundWhere(userId),
        isNull(refundCases.archivedAt),
        inArray(refundCases.status, OPEN_REFUND_STATUSES),
      ),
    )
    .all();

  const pending: ByCurrency = {};
  for (const r of openRefunds) add(pending, r.currency, r.amount - r.received);

  const recovery = db
    .select({
      kind: recoveryEvents.kind,
      currency: recoveryEvents.currency,
      amount: recoveryEvents.amountMinor,
      units: recoveryEvents.units,
    })
    .from(recoveryEvents)
    .where(eq(recoveryEvents.userId, userId))
    .all();

  const refundsReceived: ByCurrency = {};
  const creditsRedeemed: ByCurrency = {};
  const discountsUsed: ByCurrency = {};
  const realised: ByCurrency = {};
  let unitsConsumed = 0;
  let refundsReceivedCount = 0;
  let creditsRedeemedCount = 0;

  for (const r of recovery) {
    if (r.kind === 'refund_received') {
      add(refundsReceived, r.currency, r.amount);
      add(realised, r.currency, r.amount);
      refundsReceivedCount += 1;
    } else if (r.kind === 'credit_redeemed') {
      add(creditsRedeemed, r.currency, r.amount);
      add(realised, r.currency, r.amount);
      creditsRedeemedCount += 1;
    } else if (r.kind === 'discount_used') {
      add(discountsUsed, r.currency, r.amount);
      add(realised, r.currency, r.amount);
    } else if (r.kind === 'units_consumed') {
      unitsConsumed += r.units ?? 0;
    }
  }

  const upcoming =
    db
      .select({ n: sql<number>`count(*)` })
      .from(reminders)
      .where(
        and(
          eq(reminders.userId, userId),
          inArray(reminders.status, ['scheduled', 'snoozed']),
          lte(reminders.dueAt, addDays(today, 14)),
        ),
      )
      .get()?.n ?? 0;

  const metrics: Metric[] = [
    {
      key: 'available_reported',
      label: 'Available, as reported',
      description:
        'Remaining balance on records that are unverified, available or partially used, as last recorded by you. Records whose recorded expiry has already passed are excluded and shown separately.',
      byCurrency: available,
      count: availableCount,
      tone: 'neutral',
    },
    {
      key: 'verified_available',
      label: 'Of which you have verified',
      description:
        'The part of "Available, as reported" where you confirmed the balance against the provider, or re-verified it later. This is a slice of the figure above, not an extra amount.',
      byCurrency: verified,
      count: verifiedCount,
      subsetOf: 'available_reported',
      tone: 'positive',
    },
    {
      key: 'pending_refunds',
      label: 'Pending refunds',
      description:
        'Amount still outstanding on refund cases that are open. Anything you have already confirmed receiving is subtracted here and counted under "Confirmed received" instead.',
      byCurrency: pending,
      count: openRefunds.length,
      tone: 'neutral',
    },
    {
      key: 'expiring_soon',
      label: 'Expiring within 30 days',
      description:
        'The part of "Available, as reported" whose recorded expiry date falls in the next 30 days. A slice of that figure, not an extra amount.',
      byCurrency: expiringSoon,
      count: expiringCount,
      subsetOf: 'available_reported',
      tone: 'warning',
    },
    {
      key: 'past_expiry',
      label: 'Past recorded expiry',
      description:
        'Records still marked as holding value whose recorded expiry date has passed. ValueBack does not assume the value is gone — review each one and mark it used, revalidated, or expired.',
      byCurrency: pastExpiry,
      count: pastExpiryCount,
      tone: 'warning',
    },
    {
      key: 'realised_total',
      label: 'Confirmed recovered',
      description:
        'Value you explicitly confirmed receiving or using: refunds confirmed as received, credit you recorded as spent, and discounts you recorded as applied. Nothing here is inferred.',
      byCurrency: realised,
      count: refundsReceivedCount + creditsRedeemedCount,
      tone: 'positive',
    },
    {
      key: 'refunds_received',
      label: 'Refunds confirmed received',
      description: 'Part of "Confirmed recovered" that came from refund cases you confirmed.',
      byCurrency: refundsReceived,
      count: refundsReceivedCount,
      subsetOf: 'realised_total',
      tone: 'positive',
    },
    {
      key: 'credits_redeemed',
      label: 'Credit recorded as used',
      description:
        'Part of "Confirmed recovered" that came from gift cards, credits and vouchers you recorded using.',
      byCurrency: creditsRedeemed,
      count: creditsRedeemedCount,
      subsetOf: 'realised_total',
      tone: 'positive',
    },
    {
      key: 'discounts_used',
      label: 'Conditional discounts used',
      description: 'Coupons and promotional benefits you recorded as applied to a purchase.',
      byCurrency: discountsUsed,
      count: 0,
      subsetOf: 'realised_total',
      tone: 'positive',
    },
  ];

  return {
    metrics,
    metric: (key: string) => metrics.find((m) => m.key === key)!,
    unresolvedClaims: openRefunds.length,
    upcomingActions: upcoming,
    outstandingUnits,
    unitsConsumed,
  };
}

/** Outstanding value grouped by category, in one currency at a time. */
export function categoryBreakdown(userId: string, currency: string, today = todayIso()) {
  const rows = db
    .select({
      category: benefits.category,
      value: benefits.currentValueMinor,
      expiresAt: benefits.expiresAt,
    })
    .from(benefits)
    .where(
      and(
        visibleBenefitWhere(userId),
        isNull(benefits.archivedAt),
        eq(benefits.currency, currency),
        inArray(benefits.status, OUTSTANDING_STATUSES),
      ),
    )
    .all();
  const map = new Map<string, { amount: number; count: number }>();
  for (const r of rows) {
    if (r.expiresAt && r.expiresAt < today) continue;
    const e = map.get(r.category) ?? { amount: 0, count: 0 };
    e.amount += r.value ?? 0;
    e.count += 1;
    map.set(r.category, e);
  }
  return [...map.entries()]
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.amount - a.amount);
}

export function refundStatusBreakdown(userId: string) {
  const rows = db
    .select({
      status: refundCases.status,
      amount: refundCases.amountMinor,
      received: refundCases.receivedAmountMinor,
    })
    .from(refundCases)
    .where(and(visibleRefundWhere(userId), isNull(refundCases.archivedAt)))
    .all();
  const map = new Map<string, { count: number; outstanding: number }>();
  for (const r of rows) {
    const e = map.get(r.status) ?? { count: 0, outstanding: 0 };
    e.count += 1;
    e.outstanding += Math.max(0, r.amount - r.received);
    map.set(r.status, e);
  }
  return [...map.entries()].map(([status, v]) => ({ status, ...v }));
}

/** Confirmed recovery per month for the last `months` months, one currency. */
export function monthlyRecovery(userId: string, currency: string, months = 12, today = todayIso()) {
  const start = addDays(today, -31 * months);
  const rows = db
    .select({
      kind: recoveryEvents.kind,
      amount: recoveryEvents.amountMinor,
      occurredAt: recoveryEvents.occurredAt,
    })
    .from(recoveryEvents)
    .where(
      and(
        eq(recoveryEvents.userId, userId),
        eq(recoveryEvents.currency, currency),
        gte(recoveryEvents.occurredAt, start),
        isNotNull(recoveryEvents.amountMinor),
      ),
    )
    .all();

  const buckets = new Map<string, { refunds: number; credits: number }>();
  const cursor = new Date(`${today}T00:00:00Z`);
  cursor.setUTCDate(1);
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(cursor);
    d.setUTCMonth(d.getUTCMonth() - i);
    const k = d.toISOString().slice(0, 7);
    keys.push(k);
    buckets.set(k, { refunds: 0, credits: 0 });
  }
  for (const r of rows) {
    const k = monthKey(r.occurredAt);
    const b = buckets.get(k);
    if (!b) continue;
    if (r.kind === 'refund_received') b.refunds += r.amount ?? 0;
    else b.credits += r.amount ?? 0;
  }
  return keys.map((k) => ({ month: k, ...buckets.get(k)! }));
}

export function expiryBuckets(userId: string, currency: string, today = todayIso()) {
  const rows = db
    .select({ value: benefits.currentValueMinor, expiresAt: benefits.expiresAt })
    .from(benefits)
    .where(
      and(
        visibleBenefitWhere(userId),
        isNull(benefits.archivedAt),
        eq(benefits.currency, currency),
        inArray(benefits.status, OUTSTANDING_STATUSES),
        isNotNull(benefits.expiresAt),
        gte(benefits.expiresAt, today),
      ),
    )
    .all();
  const buckets = [
    { label: '0–7 days', max: 7, amount: 0, count: 0 },
    { label: '8–30 days', max: 30, amount: 0, count: 0 },
    { label: '31–90 days', max: 90, amount: 0, count: 0 },
    { label: '90+ days', max: Infinity, amount: 0, count: 0 },
  ];
  for (const r of rows) {
    const days = Math.round(
      (Date.parse(`${r.expiresAt}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
    );
    const b = buckets.find((x) => days <= x.max)!;
    b.amount += r.value ?? 0;
    b.count += 1;
  }
  return buckets;
}

export function merchantSummary(userId: string, currency: string, limit = 8) {
  const outstanding = db
    .select({ merchant: benefits.merchant, value: benefits.currentValueMinor })
    .from(benefits)
    .where(
      and(
        visibleBenefitWhere(userId),
        isNull(benefits.archivedAt),
        eq(benefits.currency, currency),
        inArray(benefits.status, OUTSTANDING_STATUSES),
      ),
    )
    .all();
  const pending = db
    .select({
      merchant: refundCases.merchant,
      amount: refundCases.amountMinor,
      received: refundCases.receivedAmountMinor,
    })
    .from(refundCases)
    .where(
      and(
        visibleRefundWhere(userId),
        isNull(refundCases.archivedAt),
        eq(refundCases.currency, currency),
        inArray(refundCases.status, OPEN_REFUND_STATUSES),
      ),
    )
    .all();

  const map = new Map<string, { outstanding: number; pendingRefunds: number }>();
  const put = (name: string, k: 'outstanding' | 'pendingRefunds', v: number) => {
    const key = name.trim() || 'Not recorded';
    const e = map.get(key) ?? { outstanding: 0, pendingRefunds: 0 };
    e[k] += v;
    map.set(key, e);
  };
  for (const r of outstanding) put(r.merchant, 'outstanding', r.value ?? 0);
  for (const r of pending) put(r.merchant, 'pendingRefunds', Math.max(0, r.amount - r.received));

  return [...map.entries()]
    .map(([merchant, v]) => ({ merchant, ...v, total: v.outstanding + v.pendingRefunds }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export function recentRecovery(userId: string, limit = 20) {
  return db
    .select()
    .from(recoveryEvents)
    .where(eq(recoveryEvents.userId, userId))
    .orderBy(desc(recoveryEvents.occurredAt), desc(recoveryEvents.createdAt))
    .limit(limit)
    .all();
}

/** Currencies actually present in the account, primary first. */
export function currenciesInUse(userId: string, primary: string): string[] {
  const a = db
    .selectDistinct({ c: benefits.currency })
    .from(benefits)
    .where(visibleBenefitWhere(userId))
    .all()
    .map((r) => r.c);
  const b = db
    .selectDistinct({ c: refundCases.currency })
    .from(refundCases)
    .where(visibleRefundWhere(userId))
    .all()
    .map((r) => r.c);
  const set = new Set([primary, ...a, ...b]);
  return [primary, ...[...set].filter((c) => c !== primary).sort()];
}
