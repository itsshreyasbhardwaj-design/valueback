import 'server-only';
import { and, eq, isNull, count } from 'drizzle-orm';
import { db } from './db';
import { benefits, entitlements, type Plan } from './db/schema';
import { nowIso } from './dates';

/**
 * Plan limits. No payment provider is connected: every account is on `free`
 * unless a developer override is enabled (see devOverrideEnabled).
 *
 * Note on households: the pricing page lists household sharing under the Family
 * plan. Because nobody can actually buy a plan yet, gating it to `family` would
 * leave a whole shipped feature unreachable and a dead button on the nav. Free
 * therefore includes one household space. This single table is the only place
 * to change when a payment provider is wired up. FEATURES.md states this openly.
 */
export const PLAN_LIMITS = {
  free: { activeBenefits: 25, documentsPerMonth: 20, households: 1, label: 'Free' },
  plus: { activeBenefits: 500, documentsPerMonth: 300, households: 1, label: 'ValueBack Plus' },
  family: { activeBenefits: 500, documentsPerMonth: 300, households: 3, label: 'ValueBack Family' },
} as const satisfies Record<
  Plan,
  { activeBenefits: number; documentsPerMonth: number; households: number; label: string }
>;

/** Dev-only plan switching, so the entitlement system is testable without payments. */
export function devOverrideEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.VALUEBACK_DEV_PLAN_OVERRIDE === '1';
}

export function setPlan(userId: string, plan: Plan): void {
  if (!devOverrideEnabled()) throw new Error('Plan changes are not available.');
  db.insert(entitlements)
    .values({ userId, plan, source: 'dev_override', updatedAt: nowIso() })
    .onConflictDoUpdate({
      target: entitlements.userId,
      set: { plan, source: 'dev_override', updatedAt: nowIso() },
    })
    .run();
}

export function activeBenefitCount(userId: string): number {
  const row = db
    .select({ n: count() })
    .from(benefits)
    .where(and(eq(benefits.userId, userId), isNull(benefits.archivedAt)))
    .get();
  return row?.n ?? 0;
}

export type LimitCheck = { allowed: boolean; used: number; limit: number; message?: string };

export function checkBenefitLimit(userId: string, plan: Plan): LimitCheck {
  const limit = PLAN_LIMITS[plan].activeBenefits;
  const used = activeBenefitCount(userId);
  return used >= limit
    ? {
        allowed: false,
        used,
        limit,
        message: `The ${PLAN_LIMITS[plan].label} plan tracks up to ${limit} active records. Archive something you no longer need, or see Pricing.`,
      }
    : { allowed: true, used, limit };
}
