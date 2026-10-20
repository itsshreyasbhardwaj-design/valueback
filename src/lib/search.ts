import 'server-only';
import { and, desc, eq, like, or, sql } from 'drizzle-orm';
import { db } from './db';
import { benefits, documents, refundCases } from './db/schema';
import { visibleBenefitWhere, visibleRefundWhere } from './authz';

/**
 * Cross-record search. Redemption codes are stored encrypted and are not
 * searchable by design — there is nothing to match against.
 */
export type SearchResults = {
  benefits: Array<typeof benefits.$inferSelect>;
  refunds: Array<typeof refundCases.$inferSelect>;
  documents: Array<{ id: string; filename: string; createdAt: string; benefitId: string | null; refundCaseId: string | null; excerpt: string }>;
  total: number;
};

export function search(
  userId: string,
  query: string,
  opts: { includeDocumentText: boolean; limit?: number } = { includeDocumentText: true },
): SearchResults {
  const q = query.trim();
  if (q.length < 2) return { benefits: [], refunds: [], documents: [], total: 0 };
  const term = `%${q.toLowerCase()}%`;
  const limit = opts.limit ?? 15;

  const benefitRows = db
    .select()
    .from(benefits)
    .where(
      and(
        visibleBenefitWhere(userId),
        sql`(lower(${benefits.title}) LIKE ${term} OR lower(${benefits.merchant}) LIKE ${term}
             OR lower(${benefits.notes}) LIKE ${term} OR lower(${benefits.tags}) LIKE ${term}
             OR lower(${benefits.conditions}) LIKE ${term} OR lower(${benefits.category}) LIKE ${term})`,
      ),
    )
    .orderBy(desc(benefits.updatedAt))
    .limit(limit)
    .all();

  const refundRows = db
    .select()
    .from(refundCases)
    .where(
      and(
        visibleRefundWhere(userId),
        sql`(lower(${refundCases.merchant}) LIKE ${term} OR lower(${refundCases.orderRef}) LIKE ${term}
             OR lower(${refundCases.referenceNumber}) LIKE ${term} OR lower(${refundCases.notes}) LIKE ${term})`,
      ),
    )
    .orderBy(desc(refundCases.updatedAt))
    .limit(limit)
    .all();

  let documentRows: SearchResults['documents'] = [];
  if (opts.includeDocumentText) {
    documentRows = db
      .select({
        id: documents.id,
        filename: documents.filename,
        createdAt: documents.createdAt,
        benefitId: documents.benefitId,
        refundCaseId: documents.refundCaseId,
        extractedText: documents.extractedText,
      })
      .from(documents)
      .where(
        and(
          eq(documents.userId, userId),
          or(like(sql`lower(${documents.filename})`, term), like(sql`lower(${documents.extractedText})`, term)),
        ),
      )
      .orderBy(desc(documents.createdAt))
      .limit(limit)
      .all()
      .map((d) => ({
        id: d.id,
        filename: d.filename,
        createdAt: d.createdAt,
        benefitId: d.benefitId,
        refundCaseId: d.refundCaseId,
        excerpt: excerptAround(d.extractedText ?? '', q),
      }));
  }

  return {
    benefits: benefitRows,
    refunds: refundRows,
    documents: documentRows,
    total: benefitRows.length + refundRows.length + documentRows.length,
  };
}

function excerptAround(text: string, q: string, span = 120): string {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i === -1) return text.slice(0, span).replace(/\s+/g, ' ').trim();
  const start = Math.max(0, i - span / 3);
  return `${start > 0 ? '…' : ''}${text.slice(start, start + span).replace(/\s+/g, ' ').trim()}…`;
}
