import 'server-only';

/**
 * Fixed-window counter held in process memory.
 * ponytail: in-process is correct for the documented deployment (one Node
 * process, local SQLite). A multi-instance deployment needs a shared store —
 * swap the Map for Redis here; call sites do not change. See SECURITY.md.
 */
type Entry = { count: number; resetAt: number };
const buckets = new Map<string, Entry>();

export type RateLimitResult = { ok: boolean; retryAfterSeconds: number };

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }
  entry.count += 1;
  if (entry.count > limit) {
    return { ok: false, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfterSeconds: 0 };
}

export function resetRateLimits(): void {
  buckets.clear();
}

/** Opportunistic cleanup so the Map cannot grow without bound. */
export function sweepRateLimits(now = Date.now()): void {
  for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
}

export const LIMITS = {
  signIn: { limit: 10, windowMs: 15 * 60_000 },
  signUp: { limit: 5, windowMs: 60 * 60_000 },
  passwordChange: { limit: 5, windowMs: 15 * 60_000 },
  recovery: { limit: 5, windowMs: 60 * 60_000 },
  upload: { limit: 60, windowMs: 60 * 60_000 },
  inviteAccept: { limit: 20, windowMs: 60 * 60_000 },
} as const;
