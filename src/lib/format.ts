import { formatDate, type IsoDate } from './dates';
import { formatMoney, minorToDecimalString } from './money';
import type { BenefitCategory, BenefitStatus } from './db/schema';

export type DisplayPrefs = { currency: string; dateFormat: 'dd/MM/yyyy' | 'MM/dd/yyyy' | 'yyyy-MM-dd'; locale?: string };

export const CATEGORY_LABELS: Record<BenefitCategory, string> = {
  gift_card: 'Gift card',
  store_credit: 'Store credit',
  refund: 'Refund credit',
  cashback: 'Cashback',
  coupon: 'Coupon',
  prepaid_service: 'Prepaid service',
  membership_credit: 'Membership credit',
  loyalty_reward: 'Loyalty reward',
  travel_voucher: 'Travel voucher',
  other: 'Other',
};

export const STATUS_LABELS: Record<BenefitStatus, string> = {
  unverified: 'Unverified',
  available: 'Available',
  partially_used: 'Partially used',
  redeemed: 'Redeemed',
  expired_per_terms: 'Expired per terms',
  invalid: 'Invalid',
  archived: 'Archived',
};

export const STATUS_TONES: Record<BenefitStatus, 'neutral' | 'positive' | 'warning' | 'danger' | 'info'> = {
  unverified: 'neutral',
  available: 'positive',
  partially_used: 'info',
  redeemed: 'neutral',
  expired_per_terms: 'warning',
  invalid: 'danger',
  archived: 'neutral',
};

export function money(minor: number | null | undefined, currency: string): string {
  if (minor == null) return '—';
  return formatMoney(minor, currency);
}

export function moneyInput(minor: number | null | undefined, currency: string): string {
  return minor == null ? '' : minorToDecimalString(minor, currency);
}

export function date(value: IsoDate | null | undefined, prefs: Pick<DisplayPrefs, 'dateFormat'>): string {
  return formatDate(value, prefs.dateFormat);
}

/** "in 6 days" / "4 days ago" / "today" */
export function relativeDays(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`;
}

export function timestamp(iso: string, prefs: Pick<DisplayPrefs, 'dateFormat'>): string {
  const d = formatDate(iso.slice(0, 10), prefs.dateFormat);
  const time = iso.slice(11, 16);
  return `${d}${time ? ` at ${time} UTC` : ''}`;
}

export function pluralise(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function parseTags(json: string): string[] {
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v) ? v.map(String).slice(0, 20) : [];
  } catch {
    return [];
  }
}
