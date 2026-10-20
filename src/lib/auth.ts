import 'server-only';
import { eq } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { db } from './db';
import { entitlements, sessions, userSettings, users } from './db/schema';
import { newToken, sha256 } from './crypto';
import { getOrCreateSettings } from './accounts';

export {
  changePassword,
  getOrCreateSettings,
  purgeExpiredSessions,
  registerUser,
  revokeSessions,
  userSessions,
  verifyCredentials,
} from './accounts';

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
  if (token)
    db.delete(sessions)
      .where(eq(sessions.id, sha256(token)))
      .run();
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
    db.delete(sessions)
      .where(eq(sessions.id, sha256(token)))
      .run();
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

/** The hashed id of the session making this request, for "keep me signed in". */
export async function currentSessionId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? sha256(token) : null;
}
