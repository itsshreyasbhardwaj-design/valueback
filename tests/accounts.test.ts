import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { auditLog, users } from '@/lib/db/schema';
import {
  changePassword,
  registerUser,
  verifyCredentials,
  getOrCreateSettings,
} from '@/lib/accounts';
import {
  codeHint,
  decryptSecret,
  encryptSecret,
  hashPassword,
  newRecoveryCode,
  normaliseRecoveryCode,
  sha256,
  verifyPassword,
} from '@/lib/crypto';
import { audit } from '@/lib/audit';
import { checkBenefitLimit, PLAN_LIMITS, devOverrideEnabled } from '@/lib/entitlements';
import { createBenefit } from '@/lib/benefits';
import { makeUser, OFFSETS } from './helpers/factory';

describe('registration', () => {
  it('creates the user, their settings and a free entitlement', () => {
    const r = registerUser('New.User@Example.Test', 'a-long-enough-password', 'New User');
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const row = db.select().from(users).where(eq(users.id, r.userId)).get()!;
    expect(row.email).toBe('new.user@example.test'); // normalised
    expect(row.passwordHash).not.toContain('a-long-enough-password');
    expect(getOrCreateSettings(r.userId).currency).toBe('INR');
  });

  it('refuses a duplicate address regardless of case', () => {
    registerUser('dupe@example.test', 'a-long-enough-password', '');
    const second = registerUser('DUPE@example.test', 'another-long-password', '');
    expect(second.ok).toBe(false);
  });
});

describe('signing in', () => {
  it('accepts the right password and rejects the wrong one', () => {
    const u = makeUser({ password: 'correct-horse-battery' });
    expect(verifyCredentials(u.email, 'correct-horse-battery')).toBe(u.id);
    expect(verifyCredentials(u.email, 'wrong')).toBeNull();
  });

  it('returns null for an unknown address without throwing', () => {
    expect(verifyCredentials('nobody@example.test', 'whatever')).toBeNull();
  });

  it('spends comparable time on a missing account as on a wrong password', () => {
    const u = makeUser({ password: 'correct-horse-battery' });
    const t0 = performance.now();
    verifyCredentials(u.email, 'wrong-password');
    const wrongPassword = performance.now() - t0;

    const t1 = performance.now();
    verifyCredentials('nobody-at-all@example.test', 'wrong-password');
    const missingAccount = performance.now() - t1;

    // Both paths run a real scrypt hash, so neither is an order of magnitude faster.
    const ratio =
      Math.max(wrongPassword, missingAccount) /
      Math.max(1, Math.min(wrongPassword, missingAccount));
    expect(ratio).toBeLessThan(5);
  });
});

describe('changing a password', () => {
  it('requires the current one', () => {
    const u = makeUser({ password: 'original-password-1' });
    expect(changePassword(u.id, 'nope', 'brand-new-password').ok).toBe(false);
    expect(verifyCredentials(u.email, 'original-password-1')).toBe(u.id);
  });

  it('replaces the hash when the current one is right', () => {
    const u = makeUser({ password: 'original-password-1' });
    expect(changePassword(u.id, 'original-password-1', 'brand-new-password').ok).toBe(true);
    expect(verifyCredentials(u.email, 'original-password-1')).toBeNull();
    expect(verifyCredentials(u.email, 'brand-new-password')).toBe(u.id);
  });
});

describe('password hashing', () => {
  it('salts, so the same password hashes differently every time', () => {
    const a = hashPassword('same-password-here');
    const b = hashPassword('same-password-here');
    expect(a).not.toBe(b);
    expect(verifyPassword('same-password-here', a)).toBe(true);
    expect(verifyPassword('same-password-here', b)).toBe(true);
  });

  it('records the parameters so they can be raised later', () => {
    expect(hashPassword('x').startsWith('scrypt$32768$8$1$')).toBe(true);
  });

  it('rejects a malformed stored hash instead of crashing', () => {
    expect(verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(verifyPassword('x', 'scrypt$1$2$3$bad$bad')).toBe(false);
  });

  it('normalises unicode so the same typed password always matches', () => {
    const composed = 'café-password-123';
    const decomposed = composed.normalize('NFD');
    expect(composed).not.toBe(decomposed);
    expect(verifyPassword(decomposed, hashPassword(composed))).toBe(true);
  });
});

describe('authenticated encryption', () => {
  it('round-trips a code and hides the plaintext', () => {
    const envelope = encryptSecret('GC-1234-5678');
    expect(envelope).not.toContain('1234');
    expect(envelope.startsWith('v1.')).toBe(true);
    expect(decryptSecret(envelope)).toBe('GC-1234-5678');
  });

  it('produces a different envelope every time', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });

  it('refuses a tampered envelope rather than returning garbage', () => {
    const envelope = encryptSecret('GC-1234-5678');
    const parts = envelope.split('.');
    const flipped = Buffer.from(parts[3]!, 'base64url');
    flipped[0] = (flipped[0] ?? 0) ^ 0xff;
    parts[3] = flipped.toString('base64url');
    expect(decryptSecret(parts.join('.'))).toBeNull();
    expect(decryptSecret('rubbish')).toBeNull();
    expect(decryptSecret('v1.a.b.c')).toBeNull();
  });

  it('masks a code to its last four characters', () => {
    expect(codeHint('GC-1234-5678')).toBe('••••5678');
  });
});

describe('recovery codes', () => {
  it('generates readable codes without ambiguous characters', () => {
    for (let i = 0; i < 20; i++) {
      const code = newRecoveryCode();
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    }
  });

  it('normalises what the user types', () => {
    expect(normaliseRecoveryCode('abcd-efgh-jklm')).toBe('ABCDEFGHJKLM');
    expect(normaliseRecoveryCode(' ab cd efgh jklm ')).toBe('ABCDEFGHJKLM');
  });

  it('is stored hashed, so the database cannot reveal it', () => {
    const code = newRecoveryCode();
    const stored = hashPassword(normaliseRecoveryCode(code));
    expect(stored).not.toContain(code.replace(/-/g, ''));
    expect(verifyPassword(normaliseRecoveryCode(code.toLowerCase()), stored)).toBe(true);
  });
});

describe('the audit log', () => {
  it('drops anything that could carry money, text or a secret', () => {
    const u = makeUser();
    audit(u.id, 'test.event', 'benefit', 'b_1', {
      status: 'available',
      amountMinor: 123_456,
      code: 'GC-1234',
      notes: 'private note',
      extractedText: 'whole receipt',
      count: 3,
    });
    const row = db.select().from(auditLog).where(eq(auditLog.userId, u.id)).all().at(-1)!;
    const meta = JSON.parse(row.meta) as Record<string, unknown>;
    expect(meta).toEqual({ status: 'available', count: 3 });
  });
});

describe('plan entitlements', () => {
  it('starts every account on free', () => {
    const u = makeUser();
    expect(checkBenefitLimit(u.id, 'free').limit).toBe(PLAN_LIMITS.free.activeBenefits);
  });

  it('blocks a create once the limit is reached and explains why', () => {
    const u = makeUser();
    for (let i = 0; i < PLAN_LIMITS.free.activeBenefits; i++) {
      createBenefit({
        userId: u.id,
        title: `B${i}`,
        category: 'other',
        currency: 'INR',
        reminderOffsets: OFFSETS,
      });
    }
    const check = checkBenefitLimit(u.id, 'free');
    expect(check.allowed).toBe(false);
    expect(check.message).toMatch(/25 active records/);
  });

  it('keeps the developer override switched off unless explicitly enabled', () => {
    expect(devOverrideEnabled()).toBe(false);
  });
});

describe('hashing helper', () => {
  it('produces a stable 64-character sha-256', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
