import type { benefits, refundCases } from './db/schema';
import { daysBetween, todayIso } from './dates';
import { formatMoney } from './money';

/**
 * Deterministic attention scoring.
 *
 * The score is an ordering device, not a probability. Every point added comes
 * with a plain-language reason, and the UI shows the reasons rather than the
 * number alone. There is no model and no claim about likelihood of recovery.
 */
export type Priority = { score: number; reasons: string[] };

type BenefitRow = typeof benefits.$inferSelect;
type RefundRow = typeof refundCases.$inferSelect;

const EXPIRY_POINTS: Array<[number, number]> = [
  [3, 40],
  [7, 32],
  [14, 24],
  [30, 14],
  [60, 6],
];

function valuePoints(minor: number | null, currency: string): [number, string] | null {
  if (minor == null || minor <= 0) return null;
  const major = minor / 100; // ordering heuristic only; never written back to a balance
  const pts = major >= 5000 ? 20 : major >= 1000 ? 14 : major >= 250 ? 8 : 3;
  return [pts, `${formatMoney(minor, currency)} is still recorded as unused.`];
}

export function scoreBenefit(b: BenefitRow, today = todayIso()): Priority {
  const reasons: string[] = [];
  let score = 0;

  if (b.archivedAt || ['redeemed', 'invalid', 'archived'].includes(b.status)) {
    return { score: 0, reasons: [] };
  }

  if (b.expiresAt) {
    const days = daysBetween(today, b.expiresAt);
    if (days < 0) {
      score += 20;
      reasons.push(
        `The recorded expiry (${b.expiresAt}) has passed and this record is still marked as holding value. Check whether it is genuinely gone before writing it off.`,
      );
    } else {
      const hit = EXPIRY_POINTS.find(([limit]) => days <= limit);
      if (hit) {
        score += hit[1];
        reasons.push(
          days === 0
            ? 'The recorded expiry is today and this has not been marked as used.'
            : `The recorded expiry is in ${days} day${days === 1 ? '' : 's'} and this has not been marked as used.`,
        );
      }
    }
  }

  const vp = valuePoints(b.currentValueMinor, b.currency);
  if (vp) {
    score += vp[0];
    reasons.push(vp[1]);
  }
  if (b.currentUnits && b.currentUnits > 0) {
    score += 5;
    reasons.push(`${b.currentUnits} ${b.unitLabel || 'unit'}${b.currentUnits === 1 ? '' : 's'} remain unused.`);
  }

  if (b.evidence === 'user_entered') {
    score += 6;
    reasons.push('The balance has not been checked against the provider yet.');
  }
  if (b.status === 'unverified') {
    score += 4;
    reasons.push('This record has not been confirmed as valid.');
  }

  const stale = daysBetween(b.updatedAt.slice(0, 10), today);
  if (stale >= 90 && (b.currentValueMinor ?? 0) > 0) {
    score += 5;
    reasons.push(`Nothing has been recorded against this for ${stale} days.`);
  }

  return { score: Math.min(100, score), reasons };
}

export function scoreRefund(rc: RefundRow, today = todayIso()): Priority {
  const reasons: string[] = [];
  let score = 0;
  const closed = ['received_confirmed', 'closed_without_receipt'];
  if (rc.archivedAt || closed.includes(rc.status)) return { score: 0, reasons: [] };

  if (rc.expectedByDate) {
    const days = daysBetween(today, rc.expectedByDate);
    if (days < 0) {
      score += 35;
      reasons.push(
        `The refund window you recorded ended ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago and you have not confirmed receiving the money.`,
      );
    } else if (days <= 3) {
      score += 12;
      reasons.push(`The refund window you recorded ends in ${days} day${days === 1 ? '' : 's'}.`);
    }
  }

  const outstanding = rc.amountMinor - rc.receivedAmountMinor;
  const vp = valuePoints(outstanding, rc.currency);
  if (vp) {
    score += vp[0];
    reasons.push(`${formatMoney(outstanding, rc.currency)} is still outstanding on this case.`);
  }

  const sinceUpdate = daysBetween(rc.updatedAt.slice(0, 10), today);
  if (sinceUpdate >= 14) {
    score += 15;
    reasons.push(`There has been no activity on this case for ${sinceUpdate} days.`);
  }
  if (rc.status === 'disputed') {
    score += 10;
    reasons.push('This case is marked as disputed.');
  }
  if (rc.status === 'partially_received') {
    score += 8;
    reasons.push('Only part of the amount has been confirmed as received.');
  }

  return { score: Math.min(100, score), reasons };
}

export function priorityBand(score: number): { label: string; tone: 'urgent' | 'warning' | 'neutral' } {
  if (score >= 45) return { label: 'Needs attention', tone: 'urgent' };
  if (score >= 20) return { label: 'Worth a look', tone: 'warning' };
  return { label: 'No action needed', tone: 'neutral' };
}

/** Human label for the evidence basis. Never a percentage. */
export function evidenceLabel(e: string): { label: string; hint: string } {
  switch (e) {
    case 'document_extracted':
      return { label: 'From a document', hint: 'Read from an uploaded document and accepted by you.' };
    case 'user_confirmed':
      return { label: 'Confirmed by you', hint: 'You checked this against the provider.' };
    case 'reverified':
      return { label: 'Re-verified', hint: 'You checked the balance again after it was first recorded.' };
    case 'provider_verified':
      return { label: 'Provider verified', hint: 'Confirmed through an authorised provider connection.' };
    default:
      return { label: 'Entered by you', hint: 'Typed in by hand and not checked against the provider.' };
  }
}
