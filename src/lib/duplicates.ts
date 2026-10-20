import 'server-only';
import { and, eq, ne, isNull, sql } from 'drizzle-orm';
import { db } from './db';
import { benefits, documents, refundCases } from './db/schema';
import { daysBetween } from './dates';

/**
 * Duplicate *suggestions*. Nothing is merged or deleted automatically.
 *
 * Every query is scoped to the owner's own rows — records shared into a
 * household are deliberately excluded, so dedupe can never surface another
 * person's data.
 */
export type DuplicateHit<T> = {
  record: T;
  strength: 'strong' | 'possible';
  signals: string[];
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export function findBenefitDuplicates(
  userId: string,
  candidate: {
    id?: string;
    title: string;
    merchant: string;
    category: string;
    currency: string;
    originalValueMinor: number | null;
    issuedAt: string | null;
    expiresAt: string | null;
    codeHint: string | null;
  },
  limit = 5,
): Array<DuplicateHit<typeof benefits.$inferSelect>> {
  const where = [eq(benefits.userId, userId)];
  if (candidate.id) where.push(ne(benefits.id, candidate.id));

  const rows = db
    .select()
    .from(benefits)
    .where(and(...where))
    .limit(500)
    .all();
  const hits: Array<DuplicateHit<typeof benefits.$inferSelect>> = [];

  for (const r of rows) {
    const signals: string[] = [];
    const sameMerchant =
      Boolean(candidate.merchant) && norm(r.merchant) === norm(candidate.merchant);
    const sameTitle = norm(r.title) === norm(candidate.title);
    const sameValue =
      candidate.originalValueMinor != null &&
      r.originalValueMinor === candidate.originalValueMinor &&
      r.currency === candidate.currency;
    const sameCode = Boolean(candidate.codeHint) && r.codeHint === candidate.codeHint;
    const sameExpiry = Boolean(candidate.expiresAt) && r.expiresAt === candidate.expiresAt;
    const sameIssue = Boolean(candidate.issuedAt) && r.issuedAt === candidate.issuedAt;

    if (sameMerchant) signals.push('same merchant');
    if (sameTitle) signals.push('same title');
    if (sameValue) signals.push('same original value');
    if (sameCode) signals.push('same code ending');
    if (sameExpiry) signals.push('same expiry date');
    if (sameIssue) signals.push('same issue date');
    if (r.category === candidate.category) signals.push('same category');

    const strong =
      (sameCode && sameMerchant) ||
      (sameMerchant && sameValue && (sameExpiry || sameIssue)) ||
      (sameMerchant && sameTitle && sameValue);
    const possible =
      (sameMerchant && (sameValue || sameTitle || sameExpiry)) || (sameTitle && sameValue);

    if (strong) hits.push({ record: r, strength: 'strong', signals });
    else if (possible) hits.push({ record: r, strength: 'possible', signals });
  }

  return hits
    .sort((a, b) =>
      a.strength === b.strength
        ? b.signals.length - a.signals.length
        : a.strength === 'strong'
          ? -1
          : 1,
    )
    .slice(0, limit);
}

export function findRefundDuplicates(
  userId: string,
  candidate: {
    id?: string;
    merchant: string;
    orderRef: string;
    referenceNumber?: string;
    currency: string;
    amountMinor: number;
    purchaseDate: string | null;
  },
  limit = 5,
): Array<DuplicateHit<typeof refundCases.$inferSelect>> {
  const where = [eq(refundCases.userId, userId)];
  if (candidate.id) where.push(ne(refundCases.id, candidate.id));
  const rows = db
    .select()
    .from(refundCases)
    .where(and(...where))
    .limit(500)
    .all();
  const hits: Array<DuplicateHit<typeof refundCases.$inferSelect>> = [];

  for (const r of rows) {
    const signals: string[] = [];
    const sameMerchant = norm(r.merchant) === norm(candidate.merchant);
    const sameOrder = Boolean(candidate.orderRef) && norm(r.orderRef) === norm(candidate.orderRef);
    const sameRef =
      Boolean(candidate.referenceNumber) &&
      norm(r.referenceNumber) === norm(candidate.referenceNumber ?? '');
    const sameAmount = r.amountMinor === candidate.amountMinor && r.currency === candidate.currency;
    const closeDate =
      Boolean(candidate.purchaseDate && r.purchaseDate) &&
      Math.abs(daysBetween(r.purchaseDate!, candidate.purchaseDate!)) <= 3;

    if (sameMerchant) signals.push('same merchant');
    if (sameOrder) signals.push('same order reference');
    if (sameRef) signals.push('same refund reference');
    if (sameAmount) signals.push('same amount');
    if (closeDate) signals.push('purchase date within 3 days');

    const strong = sameOrder || sameRef || (sameMerchant && sameAmount && closeDate);
    const possible = sameMerchant && (sameAmount || closeDate);
    if (strong) hits.push({ record: r, strength: 'strong', signals });
    else if (possible) hits.push({ record: r, strength: 'possible', signals });
  }
  return hits
    .sort((a, b) =>
      a.strength === b.strength
        ? b.signals.length - a.signals.length
        : a.strength === 'strong'
          ? -1
          : 1,
    )
    .slice(0, limit);
}

/** Byte-identical upload already in this account. */
export function findDocumentByHash(userId: string, sha256: string, excludeId?: string) {
  const where = [eq(documents.userId, userId), eq(documents.sha256, sha256)];
  if (excludeId) where.push(ne(documents.id, excludeId));
  return (
    db
      .select()
      .from(documents)
      .where(and(...where))
      .get() ?? null
  );
}

/** Account-wide sweep used by the Duplicates review screen. */
export function scanBenefitDuplicates(userId: string, limit = 20) {
  const rows = db
    .select()
    .from(benefits)
    .where(and(eq(benefits.userId, userId), isNull(benefits.archivedAt)))
    .limit(500)
    .all();

  const seen = new Set<string>();
  const groups: Array<{
    a: typeof benefits.$inferSelect;
    b: typeof benefits.$inferSelect;
    strength: 'strong' | 'possible';
    signals: string[];
  }> = [];
  for (const r of rows) {
    for (const hit of findBenefitDuplicates(userId, r, 3)) {
      const key = [r.id, hit.record.id].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      groups.push({ a: r, b: hit.record, strength: hit.strength, signals: hit.signals });
    }
  }
  return groups
    .sort((x, y) => (x.strength === y.strength ? 0 : x.strength === 'strong' ? -1 : 1))
    .slice(0, limit);
}

export function duplicateDocumentCount(userId: string): number {
  return (
    db
      .select({ n: sql<number>`count(*)` })
      .from(
        db
          .select({ h: documents.sha256 })
          .from(documents)
          .where(eq(documents.userId, userId))
          .groupBy(documents.sha256)
          .having(sql`count(*) > 1`)
          .as('d'),
      )
      .get()?.n ?? 0
  );
}
