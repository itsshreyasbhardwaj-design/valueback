/**
 * Rule-based document understanding. No model, no network, no API key.
 *
 * Everything here produces a *suggestion* with a stated confidence level and
 * the snippet it came from. Nothing is written to a benefit until the user
 * accepts it on the review screen. Confidence is a three-way label on purpose:
 * a percentage would imply a calibration this does not have.
 */
import type { BenefitCategory } from './db/schema';
import { addDays, isIsoDate, parseLooseDate, todayIso } from './dates';
import { parseMoneyToMinor } from './money';

export type Confidence = 'high' | 'medium' | 'low';

export type Proposed<T> = {
  value: T;
  confidence: Confidence;
  /** the text the value was read from, shown next to the field in review */
  evidence: string;
  /** set on values the UI must mask and the storage layer must encrypt */
  sensitive?: boolean;
};

export type ExtractionFields = {
  title?: Proposed<string>;
  merchant?: Proposed<string>;
  orderRef?: Proposed<string>;
  currency?: Proposed<string>;
  amountMinor?: Proposed<number>;
  issuedAt?: Proposed<string>;
  expiresAt?: Proposed<string>;
  expectedByDate?: Proposed<string>;
  code?: Proposed<string>;
  conditions?: Proposed<string>;
};

export type ExtractionResult = {
  classification: BenefitCategory | 'refund_case' | null;
  classificationScore: number;
  classificationReasons: string[];
  fields: ExtractionFields;
  /** true when the text was too thin to say anything useful */
  insufficientText: boolean;
};

/* ------------------------------------------------------- classification */

type Rule = { re: RegExp; weight: number; why: string };

const CLASS_RULES: Record<BenefitCategory | 'refund_case', Rule[]> = {
  gift_card: [
    { re: /\bgift\s?cards?\b/i, weight: 6, why: 'mentions a gift card' },
    { re: /\be-?gift\b/i, weight: 5, why: 'mentions an e-gift' },
    { re: /\bgift\s?vouchers?\b/i, weight: 5, why: 'mentions a gift voucher' },
    { re: /\bredeem(?:able)?\s+(?:at|online|in\s?store)\b/i, weight: 2, why: 'describes redeeming at a store' },
  ],
  store_credit: [
    { re: /\bstore\s?credit\b/i, weight: 6, why: 'mentions store credit' },
    { re: /\bcredit\s?note\b/i, weight: 6, why: 'mentions a credit note' },
    { re: /\bwallet\s?(?:balance|credit)\b/i, weight: 4, why: 'mentions a wallet balance' },
    { re: /\baccount\s?credit\b/i, weight: 4, why: 'mentions account credit' },
  ],
  refund: [{ re: /\brefund\s?(?:voucher|credit)\b/i, weight: 4, why: 'mentions a refund voucher' }],
  refund_case: [
    { re: /\brefund\s+(?:has been\s+)?(?:initiated|processed|issued)\b/i, weight: 7, why: 'says a refund was initiated' },
    { re: /\breturn\s+(?:request|initiated|accepted|picked up)\b/i, weight: 6, why: 'describes a return' },
    { re: /\border\s+cancell?ed\b/i, weight: 5, why: 'mentions a cancelled order' },
    { re: /\brefund\b/i, weight: 3, why: 'mentions a refund' },
    { re: /\b\d+\s*(?:-|to)?\s*\d*\s*(?:business\s+)?days?\b.{0,30}\brefund\b/i, weight: 3, why: 'gives a refund timeline' },
    { re: /\brefund\b.{0,40}\b\d+\s*(?:business\s+)?days?\b/i, weight: 3, why: 'gives a refund timeline' },
  ],
  cashback: [
    { re: /\bcash\s?back\b/i, weight: 6, why: 'mentions cashback' },
    { re: /\bcashback\s+(?:credited|earned|pending)\b/i, weight: 3, why: 'describes cashback status' },
  ],
  coupon: [
    { re: /\bcoupon\b/i, weight: 6, why: 'mentions a coupon' },
    { re: /\bpromo\s?code\b/i, weight: 6, why: 'mentions a promo code' },
    { re: /\bdiscount\s?code\b/i, weight: 5, why: 'mentions a discount code' },
    { re: /\b\d{1,2}%\s?off\b/i, weight: 3, why: 'offers a percentage off' },
    { re: /\bflat\s*(?:₹|rs\.?|inr)\s?\d+\s*off\b/i, weight: 4, why: 'offers a flat amount off' },
  ],
  prepaid_service: [
    { re: /\b(?:pack|package)\s+of\s+\d+\s+(?:classes|sessions|visits)\b/i, weight: 7, why: 'describes a package of sessions' },
    { re: /\b\d+\s+(?:classes|sessions|visits|appointments)\b/i, weight: 5, why: 'counts sessions' },
    { re: /\bprepaid\b/i, weight: 3, why: 'says prepaid' },
    { re: /\bvalidity\b/i, weight: 2, why: 'mentions a validity period' },
  ],
  membership_credit: [
    { re: /\bmembership\b/i, weight: 5, why: 'mentions a membership' },
    { re: /\bsubscription\s+credit\b/i, weight: 6, why: 'mentions subscription credit' },
    { re: /\bplan\s+credit\b/i, weight: 4, why: 'mentions plan credit' },
  ],
  loyalty_reward: [
    { re: /\b(?:reward|loyalty)\s+points?\b/i, weight: 6, why: 'mentions loyalty points' },
    { re: /\byou(?:'ve| have)\s+earned\s+\d+\s+points\b/i, weight: 5, why: 'states points earned' },
  ],
  travel_voucher: [
    { re: /\b(?:travel|flight|airline|ticket)\s+(?:voucher|credit)\b/i, weight: 7, why: 'mentions a travel voucher' },
    { re: /\bPNR\b/, weight: 3, why: 'contains a PNR' },
    { re: /\bemd\b|\bfuture travel credit\b/i, weight: 4, why: 'mentions future travel credit' },
  ],
  other: [],
};

export function classify(text: string): {
  classification: BenefitCategory | 'refund_case' | null;
  score: number;
  reasons: string[];
} {
  const scores = new Map<string, { score: number; reasons: string[] }>();
  for (const [key, rules] of Object.entries(CLASS_RULES)) {
    let score = 0;
    const reasons: string[] = [];
    for (const r of rules) {
      if (r.re.test(text)) {
        score += r.weight;
        reasons.push(r.why);
      }
    }
    if (score > 0) scores.set(key, { score, reasons });
  }
  if (scores.size === 0) return { classification: null, score: 0, reasons: [] };
  const [best] = [...scores.entries()].sort((a, b) => b[1].score - a[1].score);
  const [key, v] = best!;
  // Below this the signal is one weak keyword; make the user choose instead.
  if (v.score < 4) return { classification: null, score: v.score, reasons: v.reasons };
  return { classification: key as BenefitCategory | 'refund_case', score: v.score, reasons: v.reasons };
}

/* -------------------------------------------------------------- fields */

const CURRENCY_SIGNS: Array<[RegExp, string]> = [
  [/₹|\bINR\b|\bRs\.?\b|\brupees?\b/i, 'INR'],
  [/\bUSD\b|\$(?!\s*₹)/, 'USD'],
  [/€|\bEUR\b/, 'EUR'],
  [/£|\bGBP\b/, 'GBP'],
  [/\bAED\b|\bdirhams?\b/i, 'AED'],
  [/\bSGD\b/, 'SGD'],
];

function detectCurrency(text: string): Proposed<string> | undefined {
  for (const [re, code] of CURRENCY_SIGNS) {
    const m = re.exec(text);
    if (m) return { value: code, confidence: 'high', evidence: snippet(text, m.index) };
  }
  return undefined;
}

const AMOUNT = String.raw`(?:₹|rs\.?|inr|usd|\$|eur|€|gbp|£)?\s*([0-9][0-9,\s]*(?:\.[0-9]{1,2})?)`;

const AMOUNT_RULES: Array<{ re: RegExp; confidence: Confidence; why: string }> = [
  { re: new RegExp(String.raw`(?:gift\s?card|voucher|card)\s*(?:value|amount|balance|worth)\s*(?:of)?\s*[:\-]?\s*${AMOUNT}`, 'i'), confidence: 'high', why: 'labelled card value' },
  { re: new RegExp(String.raw`refund\s*(?:amount|of|value|total)?\s*[:\-]?\s*${AMOUNT}`, 'i'), confidence: 'high', why: 'labelled refund amount' },
  { re: new RegExp(String.raw`(?:remaining|available|current)\s*(?:balance|credit|value)\s*[:\-]?\s*${AMOUNT}`, 'i'), confidence: 'high', why: 'labelled remaining balance' },
  { re: new RegExp(String.raw`(?:credit\s?note|store\s?credit|cashback)\s*(?:amount|value|of)?\s*[:\-]?\s*${AMOUNT}`, 'i'), confidence: 'high', why: 'labelled credit amount' },
  { re: new RegExp(String.raw`(?:amount|total|value|balance|worth)\s*[:\-]\s*${AMOUNT}`, 'i'), confidence: 'medium', why: 'generic amount label' },
  { re: new RegExp(String.raw`(?:₹|rs\.?\s|inr\s|\$|€|£)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)`, 'i'), confidence: 'low', why: 'an amount appears in the text' },
];

function detectAmount(text: string, currency: string): Proposed<number> | undefined {
  for (const rule of AMOUNT_RULES) {
    const m = rule.re.exec(text);
    if (!m?.[1]) continue;
    const minor = parseMoneyToMinor(m[1], currency);
    if (minor == null || minor <= 0) continue;
    return { value: minor, confidence: rule.confidence, evidence: snippet(text, m.index) };
  }
  return undefined;
}

const DATE_LABELS: Array<{ field: 'expiresAt' | 'issuedAt'; re: RegExp; confidence: Confidence }> = [
  { field: 'expiresAt', re: /(?:valid\s*(?:till|until|thru|through|up\s?to)|expir(?:es|y|ation)\s*(?:on|date)?|use\s*(?:by|before)|last\s*date)\s*[:\-]?\s*([^\n,;]{4,30})/i, confidence: 'high' },
  { field: 'issuedAt', re: /(?:issued?\s*(?:on|date)?|date\s*of\s*issue|purchase\s*date|order\s*date|invoice\s*date|transaction\s*date)\s*[:\-]?\s*([^\n,;]{4,30})/i, confidence: 'high' },
];

const ORDER_RE =
  /\b(?:order|invoice|reference|ref|txn|transaction|booking|awb|rma)\s*(?:no\.?|number|id|#)?\s*[:#]?\s*([A-Z0-9][A-Z0-9\/-]{4,28})\b/i;

const CODE_RE =
  /\b(?:(?:gift\s?card|voucher|promo|coupon|discount|redemption|pin)\s*code|code)\s*[:\-]?\s*([A-Z0-9][A-Z0-9-]{3,30})\b/i;

const REFUND_WINDOW_RE =
  /refund[^.\n]{0,60}?\bwithin\s+(\d{1,3})\s*(?:-\s*\d{1,3}\s*)?(business\s+|working\s+)?(day|week)s?|\bwithin\s+(\d{1,3})\s*(?:-\s*\d{1,3}\s*)?(business\s+|working\s+)?(day|week)s?[^.\n]{0,60}?refund/i;

const CONDITION_RE =
  /((?:not\s+valid|cannot\s+be\s+(?:combined|exchanged|redeemed)|non[-\s]?refundable|no\s+cash\s+(?:value|alternative)|minimum\s+(?:purchase|order|spend)|one\s+per\s+customer|valid\s+only\s+on)[^\n.]{0,120}\.?)/i;

function snippet(text: string, index: number, span = 70): string {
  const start = Math.max(0, index - 10);
  return text.slice(start, Math.min(text.length, start + span)).replace(/\s+/g, ' ').trim();
}

/**
 * Pull structured suggestions out of document text.
 * `context` lets an .eml file contribute its sender and date, which are far
 * more reliable than anything in the body.
 */
export function extractFields(
  text: string,
  options: {
    defaultCurrency: string;
    today?: string;
    context?: { merchant?: string; date?: string; subject?: string };
  },
): ExtractionFields {
  const today = options.today ?? todayIso();
  const fields: ExtractionFields = {};
  const flat = text.replace(/[ \t]+/g, ' ');

  const currency = detectCurrency(flat);
  if (currency) fields.currency = currency;
  const currencyCode = currency?.value ?? options.defaultCurrency;

  const amount = detectAmount(flat, currencyCode);
  if (amount) fields.amountMinor = amount;

  for (const d of DATE_LABELS) {
    if (fields[d.field]) continue;
    const m = d.re.exec(flat);
    if (!m?.[1]) continue;
    const parsed = parseLooseDate(m[1], today);
    if (parsed) {
      fields[d.field] = { value: parsed, confidence: d.confidence, evidence: snippet(flat, m.index) };
    }
  }

  const order = ORDER_RE.exec(flat);
  if (order?.[1]) {
    fields.orderRef = { value: order[1].toUpperCase(), confidence: 'high', evidence: snippet(flat, order.index) };
  }

  const code = CODE_RE.exec(flat);
  if (code?.[1] && !/^\d{1,3}$/.test(code[1])) {
    fields.code = {
      value: code[1].toUpperCase(),
      confidence: 'medium',
      // never echo the code itself back into the evidence line
      evidence: 'A code-shaped value was found and will be stored encrypted.',
      sensitive: true,
    };
  }

  const window = REFUND_WINDOW_RE.exec(flat);
  if (window) {
    const n = Number(window[1] ?? window[4]);
    const unit = (window[3] ?? window[6] ?? 'day').toLowerCase();
    if (Number.isFinite(n) && n > 0) {
      const base = fields.issuedAt?.value ?? options.context?.date ?? today;
      const days = unit.startsWith('week') ? n * 7 : n;
      fields.expectedByDate = {
        value: addDays(base, days),
        confidence: fields.issuedAt || options.context?.date ? 'medium' : 'low',
        evidence: `${snippet(flat, window.index)} — counted from ${base}`,
      };
    }
  }

  const cond = CONDITION_RE.exec(flat);
  if (cond?.[1]) {
    fields.conditions = { value: cond[1].trim(), confidence: 'medium', evidence: snippet(flat, cond.index) };
  }

  const merchant = detectMerchant(flat, options.context);
  if (merchant) fields.merchant = merchant;

  const title = buildTitle(flat, options.context, merchant?.value);
  if (title) fields.title = title;

  return fields;
}

const MERCHANT_LABEL_RE = /(?:merchant|seller|sold\s?by|store|brand|from|retailer)\s*[:\-]\s*([A-Za-z0-9][A-Za-z0-9 &'.\-]{1,40})/i;
const GENERIC_DOMAINS = new Set(['gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com', 'icloud.com', 'proton.me']);

function detectMerchant(
  text: string,
  context?: { merchant?: string; date?: string; subject?: string },
): Proposed<string> | undefined {
  if (context?.merchant) {
    return { value: context.merchant, confidence: 'high', evidence: 'Sender of the imported email' };
  }
  const labelled = MERCHANT_LABEL_RE.exec(text);
  if (labelled?.[1]) {
    return { value: labelled[1].trim(), confidence: 'high', evidence: snippet(text, labelled.index) };
  }
  const domain = /\b(?:www\.)?([a-z0-9][a-z0-9-]{1,30})\.(?:com|in|co\.in|io|net|org|shop|store)\b/i.exec(text);
  if (domain?.[1] && !GENERIC_DOMAINS.has(domain[0].toLowerCase())) {
    const name = domain[1]!;
    return {
      value: name.charAt(0).toUpperCase() + name.slice(1),
      confidence: 'low',
      evidence: snippet(text, domain.index),
    };
  }
  return undefined;
}

function buildTitle(
  text: string,
  context?: { subject?: string },
  merchant?: string,
): Proposed<string> | undefined {
  if (context?.subject) {
    return { value: context.subject.slice(0, 80), confidence: 'medium', evidence: 'Email subject line' };
  }
  const firstLine = text.split('\n').map((l) => l.trim()).find((l) => l.length >= 4 && l.length <= 80);
  if (firstLine) {
    return { value: firstLine.slice(0, 80), confidence: 'low', evidence: 'First readable line of the document' };
  }
  if (merchant) return { value: `${merchant} benefit`, confidence: 'low', evidence: 'Built from the merchant name' };
  return undefined;
}

/** Full pipeline over already-extracted text. */
export function analyseText(
  text: string,
  options: { defaultCurrency: string; today?: string; context?: { merchant?: string; date?: string; subject?: string } },
): ExtractionResult {
  const trimmed = text.trim();
  if (trimmed.length < 12) {
    return {
      classification: null,
      classificationScore: 0,
      classificationReasons: [],
      fields: {},
      insufficientText: true,
    };
  }
  const c = classify(trimmed);
  return {
    classification: c.classification,
    classificationScore: c.score,
    classificationReasons: c.reasons,
    fields: extractFields(trimmed, options),
    insufficientText: false,
  };
}

export function confidenceNote(c: Confidence): string {
  return {
    high: 'Read from a clearly labelled line.',
    medium: 'Read from a likely line — please check it.',
    low: 'A guess from loose context — please check it.',
  }[c];
}

/** Suggested next actions, derived from what the document says. */
export function suggestedActions(result: ExtractionResult): string[] {
  const out: string[] = [];
  if (result.classification === 'refund_case') {
    out.push('Track this as a refund case so the expected date is watched.');
    if (result.fields.expectedByDate) out.push('A refund window was found — a check-in reminder will be scheduled.');
  } else if (result.classification) {
    out.push('Save this as a benefit so its expiry is watched.');
  }
  if (result.fields.code) out.push('A code was detected. It will be encrypted and shown masked.');
  if (!result.fields.amountMinor) out.push('No amount was found — add it by hand if the document has one.');
  if (!result.fields.expiresAt && result.classification !== 'refund_case') {
    out.push('No expiry date was found — add it if you know it, so reminders can be scheduled.');
  }
  return out;
}

export function isIsoDateValue(v: unknown): v is string {
  return typeof v === 'string' && isIsoDate(v);
}
