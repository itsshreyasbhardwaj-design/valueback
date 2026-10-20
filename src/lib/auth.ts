import 'server-only';
import { eq } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { db } from './db';
import { entitlements, sessions, userSettings, users } from './db/schema';
import { newToken, sha256 } from './crypto';
import { getOrCreateSettings } from './accounts';
import { readEnv } from './env';

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
  const hours = Number(readEnv('SESSION_TTL_HOURS') ?? 720);
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

/**
 * `Secure` is correct for any real deployment, but a local production build is
 * served over http://localhost — marking the cookie Secure there would be a
 * footgun for the documented `npm run build && npm start` flow. Loopback hosts
 * are the only exception.
 */
function isLoopback(host: string | null): boolean {
  if (!host) return false;
  const name = host.split(':')[0]!.toLowerCase();
  return name === 'localhost' || name === '127.0.0.1' || name === '[::1]' || name === '::1';
}

export async function createSession(userId: string): Promise<void> {
  const token = newToken(32);
  const expires = new Date(Date.now() + ttlMs());
  const h = await headers();
  const ua = h.get('user-agent')?.slice(0, 200) ?? '';
  const proto = h.get('x-forwarded-proto');
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const secure = proto ? proto === 'https' : !isLoopback(host);
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
    secure,
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

/**
 * Pages and layouts render in parallel, so a page cannot rely on its layout
 * having redirected first. Redirecting here (rather than throwing) keeps an
 * unauthenticated hit on any /app route a clean 307 to the sign-in page
 * instead of a server error.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/signin');
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
