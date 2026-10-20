import { registerUser } from '@/lib/accounts';
import { db } from '@/lib/db';
import { userSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

let n = 0;

/** Creates a real account through the real registration path. */
export function makeUser(overrides: { email?: string; password?: string; name?: string } = {}) {
  n += 1;
  const email = overrides.email ?? `user${n}.${Date.now()}@example.test`;
  const password = overrides.password ?? 'a-long-enough-password';
  const result = registerUser(email, password, overrides.name ?? `User ${n}`);
  if (!result.ok) throw new Error(result.error);
  const settings = db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, result.userId))
    .get()!;
  return { id: result.userId, email, password, settings };
}

export const OFFSETS = [30, 14, 7, 3, 1];
