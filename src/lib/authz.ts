import 'server-only';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from './db';
import {
  accessGrants,
  benefits,
  documents,
  householdMembers,
  refundCases,
  type Permission,
} from './db/schema';

export class ForbiddenError extends Error {
  constructor(message = 'You do not have access to this record.') {
    super(message);
  }
}
export class NotFoundError extends Error {
  constructor(message = 'Record not found.') {
    super(message);
  }
}

export type Access = { permission: Permission; isOwner: boolean; viaHouseholdId?: string };

/** Household ids the user belongs to, with their role in each. */
export function membershipsOf(userId: string) {
  return db
    .select({ householdId: householdMembers.householdId, role: householdMembers.role })
    .from(householdMembers)
    .where(eq(householdMembers.userId, userId))
    .all();
}

/**
 * Resolve what `userId` may do with a record.
 *
 * Ownership is the only implicit access. Household membership by itself grants
 * nothing: there must be a live access_grants row for this exact record in a
 * household the user belongs to. A member whose household role is `viewer` is
 * capped at view even when the grant says edit.
 */
function resolveAccess(
  userId: string,
  ownerUserId: string,
  resourceType: 'benefit' | 'refund_case',
  resourceId: string,
): Access | null {
  if (ownerUserId === userId) return { permission: 'edit', isOwner: true };

  const memberships = membershipsOf(userId);
  if (memberships.length === 0) return null;

  const grant = db
    .select({ householdId: accessGrants.householdId, permission: accessGrants.permission })
    .from(accessGrants)
    .where(
      and(
        eq(accessGrants.resourceType, resourceType),
        eq(accessGrants.resourceId, resourceId),
        isNull(accessGrants.revokedAt),
        inArray(
          accessGrants.householdId,
          memberships.map((m) => m.householdId),
        ),
      ),
    )
    .get();
  if (!grant) return null;

  const role = memberships.find((m) => m.householdId === grant.householdId)?.role;
  if (!role) return null;
  const permission: Permission = role === 'viewer' ? 'view' : grant.permission;
  return { permission, isOwner: false, viaHouseholdId: grant.householdId };
}

export function getBenefitFor(userId: string, benefitId: string, need: Permission = 'view') {
  const benefit = db.select().from(benefits).where(eq(benefits.id, benefitId)).get();
  if (!benefit) throw new NotFoundError();
  const access = resolveAccess(userId, benefit.userId, 'benefit', benefit.id);
  // Deliberately the same error for "exists but not yours" and "does not exist".
  if (!access) throw new NotFoundError();
  if (need === 'edit' && access.permission !== 'edit') throw new ForbiddenError();
  return { benefit, access };
}

export function getRefundCaseFor(userId: string, caseId: string, need: Permission = 'view') {
  const refundCase = db.select().from(refundCases).where(eq(refundCases.id, caseId)).get();
  if (!refundCase) throw new NotFoundError();
  const access = resolveAccess(userId, refundCase.userId, 'refund_case', refundCase.id);
  if (!access) throw new NotFoundError();
  if (need === 'edit' && access.permission !== 'edit') throw new ForbiddenError();
  return { refundCase, access };
}

/**
 * Documents follow their parent record; an orphan document is owner-only.
 * This is what stops a shared benefit leaking an unrelated receipt.
 */
export function getDocumentFor(userId: string, documentId: string) {
  const doc = db.select().from(documents).where(eq(documents.id, documentId)).get();
  if (!doc) throw new NotFoundError();
  if (doc.userId === userId) return doc;
  if (doc.benefitId) {
    getBenefitFor(userId, doc.benefitId, 'view');
    return doc;
  }
  if (doc.refundCaseId) {
    getRefundCaseFor(userId, doc.refundCaseId, 'view');
    return doc;
  }
  throw new NotFoundError();
}

/** SQL fragment: records owned by the user OR explicitly shared with them. */
export function visibleBenefitWhere(userId: string) {
  const householdIds = membershipsOf(userId).map((m) => m.householdId);
  if (householdIds.length === 0) return eq(benefits.userId, userId);
  return or(
    eq(benefits.userId, userId),
    sql`${benefits.id} IN (
      SELECT ${accessGrants.resourceId} FROM ${accessGrants}
      WHERE ${accessGrants.resourceType} = 'benefit'
        AND ${accessGrants.revokedAt} IS NULL
        AND ${accessGrants.householdId} IN (${sql.join(
          householdIds.map((h) => sql`${h}`),
          sql`, `,
        )})
    )`,
  )!;
}

export function visibleRefundWhere(userId: string) {
  const householdIds = membershipsOf(userId).map((m) => m.householdId);
  if (householdIds.length === 0) return eq(refundCases.userId, userId);
  return or(
    eq(refundCases.userId, userId),
    sql`${refundCases.id} IN (
      SELECT ${accessGrants.resourceId} FROM ${accessGrants}
      WHERE ${accessGrants.resourceType} = 'refund_case'
        AND ${accessGrants.revokedAt} IS NULL
        AND ${accessGrants.householdId} IN (${sql.join(
          householdIds.map((h) => sql`${h}`),
          sql`, `,
        )})
    )`,
  )!;
}
