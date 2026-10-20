import { beforeEach, describe, expect, it } from 'vitest';
import {
  ForbiddenError,
  NotFoundError,
  getBenefitFor,
  getDocumentFor,
  getRefundCaseFor,
} from '@/lib/authz';
import { createBenefit, listBenefits } from '@/lib/benefits';
import { createRefundCase, listRefundCases } from '@/lib/refunds';
import { storeDocument } from '@/lib/documents';
import {
  acceptInvite,
  createHousehold,
  createInvite,
  deleteHousehold,
  leaveHousehold,
  previewInvite,
  removeMember,
  revokeShare,
  shareRecord,
  sharedWithMe,
} from '@/lib/household';
import { db } from '@/lib/db';
import { householdInvites } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { makeUser, OFFSETS } from './helpers/factory';

let owner: ReturnType<typeof makeUser>;
let other: ReturnType<typeof makeUser>;

function benefitFor(userId: string, title = 'Private credit') {
  return createBenefit({
    userId,
    title,
    category: 'store_credit',
    currency: 'INR',
    originalValueMinor: 50_000,
    reminderOffsets: OFFSETS,
  });
}

beforeEach(() => {
  owner = makeUser();
  other = makeUser();
});

describe('isolation between accounts', () => {
  it('a stranger cannot read another account’s benefit', () => {
    const b = benefitFor(owner.id);
    expect(() => getBenefitFor(other.id, b.id)).toThrow(NotFoundError);
  });

  it('a stranger cannot edit another account’s benefit', () => {
    const b = benefitFor(owner.id);
    expect(() => getBenefitFor(other.id, b.id, 'edit')).toThrow(NotFoundError);
  });

  it('gives the same error for "not yours" and "does not exist", leaking nothing', () => {
    const b = benefitFor(owner.id);
    let realMessage = '';
    let fakeMessage = '';
    try {
      getBenefitFor(other.id, b.id);
    } catch (e) {
      realMessage = (e as Error).message;
    }
    try {
      getBenefitFor(other.id, 'b_does_not_exist');
    } catch (e) {
      fakeMessage = (e as Error).message;
    }
    expect(realMessage).toBe(fakeMessage);
  });

  it('a stranger cannot read another account’s refund case', () => {
    const rc = createRefundCase({
      userId: owner.id,
      merchant: 'Zentra',
      currency: 'INR',
      amountMinor: 100_000,
      checkInDays: 7,
    });
    expect(() => getRefundCaseFor(other.id, rc.id)).toThrow(NotFoundError);
  });

  it('list queries never return another account’s rows', () => {
    benefitFor(owner.id, 'Owner only');
    benefitFor(other.id, 'Other only');
    expect(listBenefits(owner.id).rows.map((r) => r.title)).toEqual(['Owner only']);
    expect(listBenefits(other.id).rows.map((r) => r.title)).toEqual(['Other only']);
  });

  it('a stranger cannot read an uploaded document', async () => {
    const stored = await storeDocument(
      owner.id,
      new File(['hello receipt'], 'r.txt', { type: 'text/plain' }),
    );
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;
    expect(() => getDocumentFor(other.id, stored.document.id)).toThrow(NotFoundError);
    expect(getDocumentFor(owner.id, stored.document.id).id).toBe(stored.document.id);
  });
});

describe('household membership alone grants nothing', () => {
  it('a member sees no records until one is explicitly shared', () => {
    const b = benefitFor(owner.id);
    const h = createHousehold(owner.id, 'Home', 'free');
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const invite = createInvite(owner.id, h.household.id, 'member', 'free');
    expect(invite.ok).toBe(true);
    if (!invite.ok) return;
    expect(acceptInvite(other.id, invite.token).ok).toBe(true);

    // In the household, but the benefit is still invisible.
    expect(() => getBenefitFor(other.id, b.id)).toThrow(NotFoundError);
    expect(listBenefits(other.id).total).toBe(0);
    expect(sharedWithMe(other.id).benefits).toHaveLength(0);

    expect(shareRecord(owner.id, h.household.id, 'benefit', b.id, 'view').ok).toBe(true);
    expect(getBenefitFor(other.id, b.id).access.permission).toBe('view');
    expect(listBenefits(other.id).total).toBe(1);
  });

  it('a view grant cannot be used to edit', () => {
    const b = benefitFor(owner.id);
    const h = createHousehold(owner.id, 'Home', 'free');
    if (!h.ok) return;
    const invite = createInvite(owner.id, h.household.id, 'member', 'free');
    if (!invite.ok) return;
    acceptInvite(other.id, invite.token);
    shareRecord(owner.id, h.household.id, 'benefit', b.id, 'view');

    expect(() => getBenefitFor(other.id, b.id, 'edit')).toThrow(ForbiddenError);
  });

  it('an edit grant is capped to view for someone whose role is viewer', () => {
    const b = benefitFor(owner.id);
    const h = createHousehold(owner.id, 'Home', 'free');
    if (!h.ok) return;
    const invite = createInvite(owner.id, h.household.id, 'viewer', 'free');
    if (!invite.ok) return;
    acceptInvite(other.id, invite.token);
    shareRecord(owner.id, h.household.id, 'benefit', b.id, 'edit');

    expect(getBenefitFor(other.id, b.id).access.permission).toBe('view');
    expect(() => getBenefitFor(other.id, b.id, 'edit')).toThrow(ForbiddenError);
  });

  it('only the record owner can share it', () => {
    const b = benefitFor(owner.id);
    const h = createHousehold(owner.id, 'Home', 'free');
    if (!h.ok) return;
    const invite = createInvite(owner.id, h.household.id, 'member', 'free');
    if (!invite.ok) return;
    acceptInvite(other.id, invite.token);

    const attempt = shareRecord(other.id, h.household.id, 'benefit', b.id, 'edit');
    expect(attempt.ok).toBe(false);
  });

  it('only the owner can invite', () => {
    const h = createHousehold(owner.id, 'Home', 'free');
    if (!h.ok) return;
    const invite = createInvite(owner.id, h.household.id, 'member', 'free');
    if (!invite.ok) return;
    acceptInvite(other.id, invite.token);

    expect(createInvite(other.id, h.household.id, 'member', 'free').ok).toBe(false);
  });
});

describe('revocation', () => {
  function sharedSetup() {
    const b = benefitFor(owner.id);
    const h = createHousehold(owner.id, 'Home', 'free');
    if (!h.ok) throw new Error('setup');
    const invite = createInvite(owner.id, h.household.id, 'member', 'free');
    if (!invite.ok) throw new Error('setup');
    acceptInvite(other.id, invite.token);
    shareRecord(owner.id, h.household.id, 'benefit', b.id, 'edit');
    return { b, householdId: h.household.id };
  }

  it('revoking a share cuts off access immediately', () => {
    const { b, householdId } = sharedSetup();
    expect(getBenefitFor(other.id, b.id).access.permission).toBe('edit');

    expect(revokeShare(owner.id, 'benefit', b.id, householdId).ok).toBe(true);
    expect(() => getBenefitFor(other.id, b.id)).toThrow(NotFoundError);
    expect(listBenefits(other.id).total).toBe(0);
  });

  it('removing a member cuts off everything they could see', () => {
    const { b, householdId } = sharedSetup();
    expect(removeMember(owner.id, householdId, other.id).ok).toBe(true);
    expect(() => getBenefitFor(other.id, b.id)).toThrow(NotFoundError);
  });

  it('leaving a household ends access and unshares what the leaver shared', () => {
    const { b, householdId } = sharedSetup();
    const otherBenefit = benefitFor(other.id, 'Shared by the other person');
    shareRecord(other.id, householdId, 'benefit', otherBenefit.id, 'view');
    expect(getBenefitFor(owner.id, otherBenefit.id).access.permission).toBe('view');

    expect(leaveHousehold(other.id, householdId).ok).toBe(true);
    expect(() => getBenefitFor(other.id, b.id)).toThrow(NotFoundError);
    expect(() => getBenefitFor(owner.id, otherBenefit.id)).toThrow(NotFoundError);
  });

  it('the owner cannot simply leave; they must delete the household', () => {
    const { householdId } = sharedSetup();
    expect(leaveHousehold(owner.id, householdId).ok).toBe(false);
    expect(deleteHousehold(other.id, householdId).ok).toBe(false); // not the owner
    expect(deleteHousehold(owner.id, householdId).ok).toBe(true);
  });

  it('deleting the household removes every share inside it', () => {
    const { b, householdId } = sharedSetup();
    deleteHousehold(owner.id, householdId);
    expect(() => getBenefitFor(other.id, b.id)).toThrow(NotFoundError);
  });
});

describe('invitations', () => {
  it('stores only a hash, so the database cannot be replayed into access', () => {
    const h = createHousehold(owner.id, 'Home', 'free');
    if (!h.ok) return;
    const invite = createInvite(owner.id, h.household.id, 'member', 'free');
    if (!invite.ok) return;

    const row = db
      .select()
      .from(householdInvites)
      .where(eq(householdInvites.id, invite.inviteId))
      .get()!;
    expect(row.tokenHash).not.toContain(invite.token);
    expect(row.tokenHash).toHaveLength(64);
  });

  it('rejects a made-up token', () => {
    expect(previewInvite('not-a-real-token').ok).toBe(false);
    expect(acceptInvite(other.id, 'not-a-real-token').ok).toBe(false);
  });

  it('rejects an expired invitation', () => {
    const h = createHousehold(owner.id, 'Home', 'free');
    if (!h.ok) return;
    const invite = createInvite(owner.id, h.household.id, 'member', 'free');
    if (!invite.ok) return;
    db.update(householdInvites)
      .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(householdInvites.id, invite.inviteId))
      .run();

    const result = acceptInvite(other.id, invite.token);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/expired/i);
  });

  it('rejects a revoked invitation', () => {
    const h = createHousehold(owner.id, 'Home', 'free');
    if (!h.ok) return;
    const invite = createInvite(owner.id, h.household.id, 'member', 'free');
    if (!invite.ok) return;
    db.update(householdInvites)
      .set({ revokedAt: new Date().toISOString() })
      .where(eq(householdInvites.id, invite.inviteId))
      .run();
    expect(acceptInvite(other.id, invite.token).ok).toBe(false);
  });

  it('a single-use invitation cannot be reused by a third person', () => {
    const third = makeUser();
    const h = createHousehold(owner.id, 'Home', 'free');
    if (!h.ok) return;
    const invite = createInvite(owner.id, h.household.id, 'member', 'free');
    if (!invite.ok) return;

    expect(acceptInvite(other.id, invite.token).ok).toBe(true);
    const second = acceptInvite(third.id, invite.token);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toMatch(/already been used/i);
  });
});

describe('shared refund cases', () => {
  it('follow the same explicit-grant rule', () => {
    const rc = createRefundCase({
      userId: owner.id,
      merchant: 'Zentra',
      currency: 'INR',
      amountMinor: 50_000,
      checkInDays: 7,
    });
    const h = createHousehold(owner.id, 'Home', 'free');
    if (!h.ok) return;
    const invite = createInvite(owner.id, h.household.id, 'member', 'free');
    if (!invite.ok) return;
    acceptInvite(other.id, invite.token);

    expect(listRefundCases(other.id).total).toBe(0);
    shareRecord(owner.id, h.household.id, 'refund_case', rc.id, 'edit');
    expect(listRefundCases(other.id).total).toBe(1);
    expect(getRefundCaseFor(other.id, rc.id, 'edit').access.permission).toBe('edit');
  });
});
