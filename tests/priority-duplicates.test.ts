import { beforeEach, describe, expect, it } from 'vitest';
import { evidenceLabel, priorityBand, scoreBenefit, scoreRefund } from '@/lib/priority';
import {
  findBenefitDuplicates,
  findRefundDuplicates,
  scanBenefitDuplicates,
} from '@/lib/duplicates';
import { createBenefit, setBenefitStatus } from '@/lib/benefits';
import { createRefundCase, transitionRefund } from '@/lib/refunds';
import { addDays, todayIso } from '@/lib/dates';
import { makeUser, OFFSETS } from './helpers/factory';

const today = todayIso();
let user: ReturnType<typeof makeUser>;
beforeEach(() => {
  user = makeUser();
});

function benefit(over: Partial<Parameters<typeof createBenefit>[0]> = {}) {
  return createBenefit({
    userId: user.id,
    title: 'Credit',
    category: 'store_credit',
    merchant: 'Lifestyle',
    currency: 'INR',
    originalValueMinor: 100_000,
    reminderOffsets: OFFSETS,
    ...over,
  });
}

describe('benefit priority', () => {
  it('ranks an imminent expiry above a distant one', () => {
    const soon = scoreBenefit(benefit({ expiresAt: addDays(today, 2) }), today);
    const later = scoreBenefit(benefit({ expiresAt: addDays(today, 120) }), today);
    expect(soon.score).toBeGreaterThan(later.score);
  });

  it('explains itself in plain language rather than a bare number', () => {
    const p = scoreBenefit(benefit({ expiresAt: addDays(today, 5) }), today);
    expect(p.reasons.join(' ')).toMatch(/recorded expiry is in 5 days/i);
    expect(p.reasons.join(' ')).toMatch(/has not been marked as used/i);
    expect(p.reasons.every((r) => /[a-z]/i.test(r))).toBe(true);
  });

  it('flags a passed expiry for review without declaring the value gone', () => {
    const p = scoreBenefit(benefit({ expiresAt: addDays(today, -3) }), today);
    expect(p.reasons.join(' ')).toMatch(/has passed/i);
    expect(p.reasons.join(' ')).toMatch(/before writing it off/i);
  });

  it('gives a redeemed or archived record no priority at all', () => {
    const b = benefit({ expiresAt: addDays(today, 1) });
    const archived = setBenefitStatus(user.id, b, 'archived', OFFSETS);
    expect(archived.ok).toBe(true);
    if (!archived.ok) return;
    expect(scoreBenefit(archived.benefit, today)).toEqual({ score: 0, reasons: [] });
  });

  it('weighs a larger outstanding amount more heavily', () => {
    const big = scoreBenefit(benefit({ originalValueMinor: 900_000 }), today);
    const small = scoreBenefit(benefit({ originalValueMinor: 5_000 }), today);
    expect(big.score).toBeGreaterThan(small.score);
  });

  it('never exceeds 100', () => {
    const worst = scoreBenefit(
      benefit({ originalValueMinor: 99_999_900, expiresAt: addDays(today, 1) }),
      today,
    );
    expect(worst.score).toBeLessThanOrEqual(100);
  });

  it('bands scores into words for the interface', () => {
    expect(priorityBand(80).tone).toBe('urgent');
    expect(priorityBand(25).tone).toBe('warning');
    expect(priorityBand(3).tone).toBe('neutral');
  });
});

describe('refund priority', () => {
  it('escalates a case whose recorded window has passed', () => {
    const late = createRefundCase({
      userId: user.id,
      merchant: 'Late',
      currency: 'INR',
      amountMinor: 200_000,
      expectedByDate: addDays(today, -5),
      checkInDays: 7,
    });
    const p = scoreRefund(late, today);
    expect(p.score).toBeGreaterThan(40);
    expect(p.reasons.join(' ')).toMatch(/ended 5 days ago/i);
    expect(p.reasons.join(' ')).toMatch(/have not confirmed receiving/i);
  });

  it('drops a confirmed case to zero', () => {
    const rc = createRefundCase({
      userId: user.id,
      merchant: 'Done',
      currency: 'INR',
      amountMinor: 50_000,
      checkInDays: 7,
    });
    const initiated = transitionRefund(user.id, rc, 'initiated', { checkInDays: 7 });
    if (!initiated.ok) throw new Error('setup');
    const done = transitionRefund(user.id, initiated.refundCase, 'received_confirmed', {
      checkInDays: 7,
    });
    if (!done.ok) throw new Error('setup');
    expect(scoreRefund(done.refundCase, today).score).toBe(0);
  });
});

describe('evidence labels', () => {
  it('describes the basis for a number without a percentage', () => {
    for (const level of ['user_entered', 'document_extracted', 'user_confirmed', 'reverified']) {
      const { label, hint } = evidenceLabel(level);
      expect(label).not.toMatch(/\d+\s*%/);
      expect(hint.length).toBeGreaterThan(10);
    }
    expect(evidenceLabel('user_entered').label).toBe('Entered by you');
    expect(evidenceLabel('provider_verified').label).toBe('Provider verified');
  });
});

describe('duplicate suggestions', () => {
  it('spots the same card entered twice', () => {
    const first = benefit({ title: 'Lifestyle credit', expiresAt: '2026-12-31' });
    const second = benefit({ title: 'Lifestyle credit', expiresAt: '2026-12-31' });

    const hits = findBenefitDuplicates(user.id, second, 5);
    expect(hits.map((h) => h.record.id)).toContain(first.id);
    expect(hits[0]!.strength).toBe('strong');
    expect(hits[0]!.signals).toContain('same merchant');
  });

  it('treats a different merchant with the same amount as merely possible', () => {
    benefit({ title: 'Credit A', merchant: 'Shop A' });
    const b = benefit({ title: 'Credit A', merchant: 'Shop B' });
    const hits = findBenefitDuplicates(user.id, b, 5);
    expect(hits[0]?.strength).toBe('possible');
  });

  it('never suggests a record from another account', () => {
    const stranger = makeUser();
    createBenefit({
      userId: stranger.id,
      title: 'Credit',
      category: 'store_credit',
      merchant: 'Lifestyle',
      currency: 'INR',
      originalValueMinor: 100_000,
      reminderOffsets: OFFSETS,
    });
    const mine = benefit();
    expect(findBenefitDuplicates(user.id, mine, 5)).toHaveLength(0);
  });

  it('does not report a record as its own duplicate', () => {
    const b = benefit();
    expect(findBenefitDuplicates(user.id, b, 5).map((h) => h.record.id)).not.toContain(b.id);
  });

  it('matches refund cases on the order reference', () => {
    const first = createRefundCase({
      userId: user.id,
      merchant: 'Zentra',
      orderRef: 'ZE-884512',
      currency: 'INR',
      amountMinor: 100_000,
      checkInDays: 7,
    });
    const second = createRefundCase({
      userId: user.id,
      merchant: 'Zentra Electronics',
      orderRef: 'ze-884512',
      currency: 'INR',
      amountMinor: 999_000,
      checkInDays: 7,
    });
    const hits = findRefundDuplicates(user.id, second, 5);
    expect(hits[0]!.record.id).toBe(first.id);
    expect(hits[0]!.strength).toBe('strong');
  });

  it('scans the whole account and reports each pair once', () => {
    benefit({ title: 'Same thing' });
    benefit({ title: 'Same thing' });
    const groups = scanBenefitDuplicates(user.id, 20);
    expect(groups).toHaveLength(1);
  });
});
