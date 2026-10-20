import { beforeEach, describe, expect, it } from 'vitest';
import { search } from '@/lib/search';
import { LIMITS, rateLimit, resetRateLimits, sweepRateLimits } from '@/lib/rate-limit';
import { createBenefit } from '@/lib/benefits';
import { createRefundCase } from '@/lib/refunds';
import { processDocument, storeDocument } from '@/lib/documents';
import { makeUser, OFFSETS } from './helpers/factory';

describe('search', () => {
  let user: ReturnType<typeof makeUser>;

  beforeEach(() => {
    user = makeUser();
    createBenefit({
      userId: user.id,
      title: 'Bluebird Books gift card',
      category: 'gift_card',
      merchant: 'Bluebird Books',
      currency: 'INR',
      originalValueMinor: 250_000,
      notes: 'Birthday present from Asha',
      tags: ['gift', 'books'],
      conditions: 'No cash alternative',
      code: 'SECRET-CODE-9999',
      reminderOffsets: OFFSETS,
    });
    createRefundCase({
      userId: user.id,
      merchant: 'Zentra Electronics',
      orderRef: 'ZE-884512',
      currency: 'INR',
      amountMinor: 379_900,
      notes: 'Returned the broken kettle',
      checkInDays: 7,
    });
  });

  const opts = { includeDocumentText: true };

  it('finds records by title, merchant, notes, tags and conditions', () => {
    expect(search(user.id, 'bluebird', opts).benefits).toHaveLength(1);
    expect(search(user.id, 'Asha', opts).benefits).toHaveLength(1);
    expect(search(user.id, 'books', opts).benefits).toHaveLength(1);
    expect(search(user.id, 'cash alternative', opts).benefits).toHaveLength(1);
  });

  it('finds refund cases by merchant, order reference and notes', () => {
    expect(search(user.id, 'zentra', opts).refunds).toHaveLength(1);
    expect(search(user.id, 'ZE-884512', opts).refunds).toHaveLength(1);
    expect(search(user.id, 'kettle', opts).refunds).toHaveLength(1);
  });

  it('is case-insensitive and matches partial words', () => {
    expect(search(user.id, 'BLUEBIRD', opts).total).toBeGreaterThan(0);
    expect(search(user.id, 'luebir', opts).benefits).toHaveLength(1);
  });

  it('never matches an encrypted redemption code', () => {
    expect(search(user.id, 'SECRET-CODE-9999', opts).total).toBe(0);
    expect(search(user.id, '9999', opts).total).toBe(0);
  });

  it('ignores a query that is too short to be useful', () => {
    expect(search(user.id, 'a', opts).total).toBe(0);
    expect(search(user.id, '', opts).total).toBe(0);
  });

  it('never returns another account’s records', () => {
    const stranger = makeUser();
    expect(search(stranger.id, 'bluebird', opts).total).toBe(0);
  });

  it('searches document text and shows an excerpt around the match', async () => {
    const stored = await storeDocument(
      user.id,
      new File(['Order confirmation for a hand-blown vase from Harbour Home'], 'conf.txt', {
        type: 'text/plain',
      }),
    );
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;
    await processDocument(stored.document, 'INR');

    const hit = search(user.id, 'hand-blown', opts);
    expect(hit.documents).toHaveLength(1);
    expect(hit.documents[0]!.excerpt).toContain('hand-blown');
  });

  it('leaves document text out when the user has turned that off', async () => {
    const stored = await storeDocument(
      user.id,
      new File(['A private note about a vase'], 'private.txt', { type: 'text/plain' }),
    );
    if (!stored.ok) throw new Error('setup');
    await processDocument(stored.document, 'INR');

    expect(search(user.id, 'vase', { includeDocumentText: true }).documents).toHaveLength(1);
    expect(search(user.id, 'vase', { includeDocumentText: false }).documents).toHaveLength(0);
  });
});

describe('rate limiting', () => {
  beforeEach(() => resetRateLimits());

  it('allows requests up to the limit and refuses the next one', () => {
    for (let i = 0; i < 3; i++) expect(rateLimit('k', 3, 60_000).ok).toBe(true);
    const blocked = rateLimit('k', 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('keys are independent', () => {
    rateLimit('a', 1, 60_000);
    expect(rateLimit('a', 1, 60_000).ok).toBe(false);
    expect(rateLimit('b', 1, 60_000).ok).toBe(true);
  });

  it('lets requests through again once the window has passed', async () => {
    expect(rateLimit('short', 1, 30).ok).toBe(true);
    expect(rateLimit('short', 1, 30).ok).toBe(false);
    await new Promise((r) => setTimeout(r, 45));
    expect(rateLimit('short', 1, 30).ok).toBe(true);
  });

  it('sweeps expired buckets so the map cannot grow without bound', async () => {
    for (let i = 0; i < 50; i++) rateLimit(`sweep-${i}`, 1, 10);
    await new Promise((r) => setTimeout(r, 25));
    sweepRateLimits();
    // Every bucket has expired, so each key starts fresh.
    expect(rateLimit('sweep-0', 1, 1000).ok).toBe(true);
  });

  it('defines a limit for every sensitive action', () => {
    for (const [name, config] of Object.entries(LIMITS)) {
      expect(config.limit, name).toBeGreaterThan(0);
      expect(config.windowMs, name).toBeGreaterThan(0);
    }
    expect(Object.keys(LIMITS).sort()).toEqual([
      'inviteAccept',
      'passwordChange',
      'recovery',
      'signIn',
      'signUp',
      'upload',
    ]);
  });
});
