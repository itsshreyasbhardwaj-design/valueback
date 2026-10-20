import 'server-only';
import { and, eq, lt } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { db } from './db';
import { entitlements, sessions, userSettings, users } from './db/schema';
import { hashPassword, newToken, sha256, verifyPassword } from './crypto';
import { newId } from './ids';
import { nowIso } from './dates';

export const SESSION_COOKIE = 'vb_session';

function ttlMs(): number {
  const hours = Number(process.env.SESSION_TTL_HOURS ?? 720);
  return (Number.isFinite(hours) && hours > 0 ? hours : 720) * 3_600_000;
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  settings: typeof userSettings.$inferSelect;
  plan: 'free' | 'plus' | 'family';
};

/* --------------------------------------------------------------- sessions */

export async function createSession(userId: string): Promise<void> {
  const token = newToken(32);
  const expires = new Date(Date.now() + ttlMs());
  const ua = (await headers()).get('user-agent')?.slice(0, 200) ?? '';
  db.insert(sessions)
    .values({
      id: sha256(token), // only the hash is persisted
      userId,
      expiresAt: expires.toISOString(),
      userAgent: ua,
    })
    .run();

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) db.delete(sessions).where(eq(sessions.id, sha256(token))).run();
  jar.delete(SESSION_COOKIE);
}

/** Resolve the caller once per request. Returns null when unauthenticated. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = db
    .select({
      userId: sessions.userId,
      expiresAt: sessions.expiresAt,
      email: users.email,
      name: users.name,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, sha256(token)))
    .get();

  if (!row) return null;
  if (Date.parse(row.expiresAt) <= Date.now()) {
    db.delete(sessions).where(eq(sessions.id, sha256(token))).run();
    return null;
  }

  const settings = getOrCreateSettings(row.userId);
  const ent = db.select().from(entitlements).where(eq(entitlements.userId, row.userId)).get();

  return {
    id: row.userId,
    email: row.email,
    name: row.name,
    settings,
    plan: ent?.plan ?? 'free',
  };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError('Not signed in');
  return user;
}

export class AuthError extends Error {}

export function getOrCreateSettings(userId: string) {
  const existing = db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();
  if (existing) return existing;
  db.insert(userSettings).values({ userId }).onConflictDoNothing().run();
  return db.select().from(userSettings).where(eq(userSettings.userId, userId)).get()!;
}

/** Housekeeping; called opportunistically by the reminder runner. */
export function purgeExpiredSessions(): number {
  const res = db.delete(sessions).where(lt(sessions.expiresAt, nowIso())).run();
  return res.changes;
}

/* ------------------------------------------------------------------ CSRF */

/**
 * Defence in depth on top of Next's own Server Action origin check and the
 * SameSite=Lax session cookie: every mutating entry point asserts that the
 * browser-reported Origin matches the Host it was served from.
 */
export async function assertSameOrigin(): Promise<void> {
  const h = await headers();
  const origin = h.get('origin');
  if (!origin) return; // same-origin GET/navigation; no cross-site form can omit it on POST
  const host = h.get('x-forwarded-host') ?? h.get('host');
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AuthError('Bad origin');
  }
  if (!host || originHost !== host) throw new AuthError('Cross-origin request rejected');
}

/** Standard preamble for every mutating server action. */
export async function requireUserForAction(): Promise<SessionUser> {
  await assertSameOrigin();
  return requireUser();
}

/* ---------------------------------------------------------- registration */

export async function registerUser(email: string, password: string, name: string) {
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

export function verifyCredentials(email: string, password: string) {
  const row = db
    .select({ id: users.id, hash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .get();
  // Always run a hash so a missing account and a wrong password cost the same.
  const hash = row?.hash ?? '$scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA';
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

/** Invalidate every session except optionally the current one. */
export function revokeSessions(userId: string, keepSessionId?: string) {
  const rows = db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId)).all();
  for (const r of rows) {
    if (r.id !== keepSessionId) db.delete(sessions).where(eq(sessions.id, r.id)).run();
  }
}

export async function currentSessionId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? sha256(token) : null;
}

export function userSessions(userId: string) {
  return db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, userId)))
    .all();
}
