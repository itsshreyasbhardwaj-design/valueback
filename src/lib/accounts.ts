import 'server-only';
import { eq, lt } from 'drizzle-orm';
import { db } from './db';
import { entitlements, sessions, userSettings, users } from './db/schema';
import { hashPassword, verifyPassword } from './crypto';
import { newId } from './ids';
import { nowIso } from './dates';

/**
 * Account persistence. Deliberately free of next/headers so it can be unit
 * tested and used from scripts; the request-bound half lives in auth.ts.
 */

export function getOrCreateSettings(userId: string) {
  const existing = db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();
  if (existing) return existing;
  db.insert(userSettings).values({ userId }).onConflictDoNothing().run();
  return db.select().from(userSettings).where(eq(userSettings.userId, userId)).get()!;
}

export function registerUser(email: string, password: string, name: string) {
  const normalised = email.trim().toLowerCase();
  const existing = db.select({ id: users.id }).from(users).where(eq(users.email, normalised)).get();
  if (existing) return { ok: false as const, error: 'That email is already registered.' };

  const id = newId('u_');
  db.transaction((tx) => {
    tx.insert(users)
      .values({ id, email: normalised, passwordHash: hashPassword(password), name: name.trim() })
      .run();
    tx.insert(userSettings).values({ userId: id }).run();
    tx.insert(entitlements).values({ userId: id, plan: 'free' }).run();
  });
  return { ok: true as const, userId: id };
}

/** Returns the user id on success, null otherwise. */
export function verifyCredentials(email: string, password: string) {
  const row = db
    .select({ id: users.id, hash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .get();
  // Always run a hash so a missing account and a wrong password cost the same,
  // which stops the response time revealing whether an address is registered.
  const hash = row?.hash ?? 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA';
  const ok = verifyPassword(password, hash);
  return row && ok ? row.id : null;
}

export function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const row = db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, userId)).get();
  if (!row || !verifyPassword(currentPassword, row.hash)) {
    return { ok: false as const, error: 'Current password is incorrect.' };
  }
  db.update(users)
    .set({ passwordHash: hashPassword(newPassword), updatedAt: nowIso() })
    .where(eq(users.id, userId))
    .run();
  return { ok: true as const };
}

/** Invalidate every session except optionally the one that is making the change. */
export function revokeSessions(userId: string, keepSessionId?: string) {
  const rows = db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .all();
  for (const r of rows) {
    if (r.id !== keepSessionId) db.delete(sessions).where(eq(sessions.id, r.id)).run();
  }
}

export function userSessions(userId: string) {
  return db.select().from(sessions).where(eq(sessions.userId, userId)).all();
}

export function purgeExpiredSessions(): number {
  return db.delete(sessions).where(lt(sessions.expiresAt, nowIso())).run().changes;
}
