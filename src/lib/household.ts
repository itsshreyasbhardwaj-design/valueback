import 'server-only';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { db } from './db';
import {
  accessGrants,
  benefits,
  households,
  householdInvites,
  householdMembers,
  refundCases,
  users,
  type HouseholdRole,
  type Permission,
} from './db/schema';
import { newToken, sha256 } from './crypto';
import { newId } from './ids';
import { nowIso } from './dates';
import { audit } from './audit';
import { PLAN_LIMITS } from './entitlements';
import type { Plan } from './db/schema';

export const INVITE_TTL_HOURS = 72;
export const MAX_MEMBERS = { free: 4, plus: 4, family: 8 } as const;

export type Household = typeof households.$inferSelect;

export function householdsOf(userId: string) {
  return db
    .select({
      household: households,
      role: householdMembers.role,
      joinedAt: householdMembers.joinedAt,
    })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(eq(householdMembers.userId, userId))
    .all();
}

export function membersOf(householdId: string) {
  return db
    .select({
      userId: householdMembers.userId,
      role: householdMembers.role,
      joinedAt: householdMembers.joinedAt,
      name: users.name,
      email: users.email,
    })
    .from(householdMembers)
    .innerJoin(users, eq(users.id, householdMembers.userId))
    .where(eq(householdMembers.householdId, householdId))
    .all();
}

export function roleIn(householdId: string, userId: string): HouseholdRole | null {
  return (
    db
      .select({ role: householdMembers.role })
      .from(householdMembers)
      .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId)))
      .get()?.role ?? null
  );
}

export function createHousehold(userId: string, name: string, plan: Plan) {
  const owned = db
    .select({ n: sql<number>`count(*)` })
    .from(households)
    .where(eq(households.ownerUserId, userId))
    .get()?.n ?? 0;
  const limit = PLAN_LIMITS[plan].households;
  if (owned >= limit) {
    return {
      ok: false as const,
      error: `Your plan includes ${limit} household space${limit === 1 ? '' : 's'}. Leave or delete one first.`,
    };
  }
  const id = newId('h_');
  db.transaction((tx) => {
    tx.insert(households).values({ id, name: name.trim().slice(0, 80), ownerUserId: userId }).run();
    tx.insert(householdMembers)
      .values({ id: newId('hm_'), householdId: id, userId, role: 'owner' })
      .run();
  });
  audit(userId, 'household.create', 'household', id, {});
  return { ok: true as const, household: db.select().from(households).where(eq(households.id, id)).get()! };
}

/**
 * Creates an invite and returns the raw token EXACTLY ONCE. Only its hash is
 * stored, so a database read cannot be replayed into household access.
 */
export function createInvite(actorUserId: string, householdId: string, role: HouseholdRole, plan: Plan) {
  const actorRole = roleIn(householdId, actorUserId);
  if (actorRole !== 'owner') return { ok: false as const, error: 'Only the household owner can invite people.' };
  if (role === 'owner') return { ok: false as const, error: 'A household has a single owner.' };

  const count = db
    .select({ n: sql<number>`count(*)` })
    .from(householdMembers)
    .where(eq(householdMembers.householdId, householdId))
    .get()?.n ?? 0;
  if (count >= MAX_MEMBERS[plan]) {
    return { ok: false as const, error: `This household already has the maximum of ${MAX_MEMBERS[plan]} members.` };
  }

  const token = newToken(24);
  const id = newId('hi_');
  db.insert(householdInvites)
    .values({
      id,
      householdId,
      tokenHash: sha256(token),
      role,
      createdByUserId: actorUserId,
      expiresAt: new Date(Date.now() + INVITE_TTL_HOURS * 3_600_000).toISOString(),
    })
    .run();
  audit(actorUserId, 'household.invite', 'household', householdId, { role });
  return { ok: true as const, token, inviteId: id, expiresInHours: INVITE_TTL_HOURS };
}

export function invitesFor(householdId: string) {
  return db
    .select()
    .from(householdInvites)
    .where(and(eq(householdInvites.householdId, householdId), isNull(householdInvites.acceptedAt), isNull(householdInvites.revokedAt)))
    .all();
}

export function revokeInvite(actorUserId: string, inviteId: string) {
  const invite = db.select().from(householdInvites).where(eq(householdInvites.id, inviteId)).get();
  if (!invite) return { ok: false as const, error: 'Invitation not found.' };
  if (roleIn(invite.householdId, actorUserId) !== 'owner') {
    return { ok: false as const, error: 'Only the household owner can revoke invitations.' };
  }
  db.update(householdInvites).set({ revokedAt: nowIso() }).where(eq(householdInvites.id, inviteId)).run();
  audit(actorUserId, 'household.invite.revoke', 'household', invite.householdId, {});
  return { ok: true as const };
}

export type InvitePreview = { householdName: string; role: HouseholdRole; expiresAt: string };

export function previewInvite(token: string): { ok: true; preview: InvitePreview } | { ok: false; error: string } {
  const row = db
    .select({ invite: householdInvites, household: households })
    .from(householdInvites)
    .innerJoin(households, eq(households.id, householdInvites.householdId))
    .where(eq(householdInvites.tokenHash, sha256(token.trim())))
    .get();
  if (!row) return { ok: false, error: 'That invitation link is not valid.' };
  const bad = inviteProblem(row.invite);
  if (bad) return { ok: false, error: bad };
  return {
    ok: true,
    preview: { householdName: row.household.name, role: row.invite.role, expiresAt: row.invite.expiresAt },
  };
}

function inviteProblem(invite: typeof householdInvites.$inferSelect): string | null {
  if (invite.revokedAt) return 'That invitation has been revoked.';
  if (invite.acceptedAt) return 'That invitation has already been used.';
  if (Date.parse(invite.expiresAt) <= Date.now()) return 'That invitation has expired. Ask for a new one.';
  return null;
}

export function acceptInvite(userId: string, token: string) {
  const invite = db
    .select()
    .from(householdInvites)
    .where(eq(householdInvites.tokenHash, sha256(token.trim())))
    .get();
  if (!invite) return { ok: false as const, error: 'That invitation link is not valid.' };
  const bad = inviteProblem(invite);
  if (bad) return { ok: false as const, error: bad };
  if (roleIn(invite.householdId, userId)) {
    return { ok: false as const, error: 'You are already a member of this household.' };
  }

  db.transaction((tx) => {
    tx.insert(householdMembers)
      .values({ id: newId('hm_'), householdId: invite.householdId, userId, role: invite.role })
      .run();
    tx.update(householdInvites)
      .set({ acceptedAt: nowIso(), acceptedByUserId: userId })
      .where(eq(householdInvites.id, invite.id))
      .run();
  });
  audit(userId, 'household.join', 'household', invite.householdId, { role: invite.role });
  return { ok: true as const, householdId: invite.householdId };
}

export function leaveHousehold(userId: string, householdId: string) {
  const role = roleIn(householdId, userId);
  if (!role) return { ok: false as const, error: 'You are not a member of this household.' };
  if (role === 'owner') {
    return { ok: false as const, error: 'The owner cannot leave. Delete the household instead.' };
  }
  db.transaction((tx) => {
    tx.delete(householdMembers)
      .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId)))
      .run();
    // Anything this person shared into the household stops being shared.
    tx.update(accessGrants)
      .set({ revokedAt: nowIso() })
      .where(and(eq(accessGrants.householdId, householdId), eq(accessGrants.ownerUserId, userId), isNull(accessGrants.revokedAt)))
      .run();
  });
  audit(userId, 'household.leave', 'household', householdId, {});
  return { ok: true as const };
}

export function removeMember(actorUserId: string, householdId: string, memberUserId: string) {
  if (roleIn(householdId, actorUserId) !== 'owner') {
    return { ok: false as const, error: 'Only the household owner can remove members.' };
  }
  if (memberUserId === actorUserId) return { ok: false as const, error: 'The owner cannot be removed.' };
  db.transaction((tx) => {
    tx.delete(householdMembers)
      .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, memberUserId)))
      .run();
    tx.update(accessGrants)
      .set({ revokedAt: nowIso() })
      .where(and(eq(accessGrants.householdId, householdId), eq(accessGrants.ownerUserId, memberUserId), isNull(accessGrants.revokedAt)))
      .run();
  });
  audit(actorUserId, 'household.remove_member', 'household', householdId, {});
  return { ok: true as const };
}

export function deleteHousehold(actorUserId: string, householdId: string) {
  const h = db.select().from(households).where(eq(households.id, householdId)).get();
  if (!h) return { ok: false as const, error: 'Household not found.' };
  if (h.ownerUserId !== actorUserId) return { ok: false as const, error: 'Only the owner can delete a household.' };
  db.delete(households).where(eq(households.id, householdId)).run(); // cascades members, invites, grants
  audit(actorUserId, 'household.delete', 'household', householdId, {});
  return { ok: true as const };
}

/* ------------------------------------------------------ record sharing */

/**
 * Sharing is per record and owner-controlled. Household membership on its own
 * grants nothing — see authz.ts.
 */
export function shareRecord(
  ownerUserId: string,
  householdId: string,
  resourceType: 'benefit' | 'refund_case',
  resourceId: string,
  permission: Permission,
) {
  if (!roleIn(householdId, ownerUserId)) {
    return { ok: false as const, error: 'You are not a member of that household.' };
  }
  const owned =
    resourceType === 'benefit'
      ? db.select({ id: benefits.id }).from(benefits).where(and(eq(benefits.id, resourceId), eq(benefits.userId, ownerUserId))).get()
      : db.select({ id: refundCases.id }).from(refundCases).where(and(eq(refundCases.id, resourceId), eq(refundCases.userId, ownerUserId))).get();
  if (!owned) return { ok: false as const, error: 'Only the owner of a record can share it.' };

  db.insert(accessGrants)
    .values({
      id: newId('ag_'),
      householdId,
      resourceType,
      resourceId,
      ownerUserId,
      permission,
      grantedByUserId: ownerUserId,
    })
    .onConflictDoUpdate({
      target: [accessGrants.householdId, accessGrants.resourceType, accessGrants.resourceId],
      set: { permission, revokedAt: null, grantedByUserId: ownerUserId },
    })
    .run();
  audit(ownerUserId, 'share.grant', resourceType, resourceId, { permission });
  return { ok: true as const };
}

export function revokeShare(
  ownerUserId: string,
  resourceType: 'benefit' | 'refund_case',
  resourceId: string,
  householdId: string,
) {
  const grant = db
    .select()
    .from(accessGrants)
    .where(
      and(
        eq(accessGrants.householdId, householdId),
        eq(accessGrants.resourceType, resourceType),
        eq(accessGrants.resourceId, resourceId),
      ),
    )
    .get();
  if (!grant) return { ok: false as const, error: 'That record is not shared with this household.' };
  if (grant.ownerUserId !== ownerUserId) {
    return { ok: false as const, error: 'Only the owner of a record can stop sharing it.' };
  }
  db.update(accessGrants).set({ revokedAt: nowIso() }).where(eq(accessGrants.id, grant.id)).run();
  audit(ownerUserId, 'share.revoke', resourceType, resourceId, {});
  return { ok: true as const };
}

export function grantsForRecord(resourceType: 'benefit' | 'refund_case', resourceId: string) {
  return db
    .select({ grant: accessGrants, household: households })
    .from(accessGrants)
    .innerJoin(households, eq(households.id, accessGrants.householdId))
    .where(
      and(
        eq(accessGrants.resourceType, resourceType),
        eq(accessGrants.resourceId, resourceId),
        isNull(accessGrants.revokedAt),
      ),
    )
    .all();
}

/** Records other members have shared into households the user belongs to. */
export function sharedWithMe(userId: string) {
  const mine = db
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(eq(householdMembers.userId, userId))
    .all()
    .map((r) => r.householdId);
  if (mine.length === 0) return { benefits: [], refunds: [] };

  const grants = db
    .select({ grant: accessGrants, household: households })
    .from(accessGrants)
    .innerJoin(households, eq(households.id, accessGrants.householdId))
    .where(
      and(
        isNull(accessGrants.revokedAt),
        ne(accessGrants.ownerUserId, userId),
        sql`${accessGrants.householdId} IN (${sql.join(mine.map((h) => sql`${h}`), sql`, `)})`,
      ),
    )
    .all();

  const benefitRows = grants
    .filter((g) => g.grant.resourceType === 'benefit')
    .map((g) => {
      const b = db.select().from(benefits).where(eq(benefits.id, g.grant.resourceId)).get();
      return b ? { benefit: b, household: g.household, permission: g.grant.permission } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const refundRows = grants
    .filter((g) => g.grant.resourceType === 'refund_case')
    .map((g) => {
      const r = db.select().from(refundCases).where(eq(refundCases.id, g.grant.resourceId)).get();
      return r ? { refundCase: r, household: g.household, permission: g.grant.permission } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return { benefits: benefitRows, refunds: refundRows };
}
