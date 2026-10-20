import 'server-only';
import { db } from './db';
import { auditLog } from './db/schema';
import { newId } from './ids';

const BLOCKED = /code|secret|token|password|hash|amount|minor|balance|text|note|cipher/i;

/**
 * Append an audit row. Keys that could carry money, free text or secrets are
 * dropped rather than redacted, so a future field cannot leak by being added.
 */
export function audit(
  userId: string | null,
  action: string,
  entityType = '',
  entityId = '',
  meta: Record<string, unknown> = {},
): void {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (BLOCKED.test(k)) continue;
    if (typeof v === 'string' && v.length > 120) continue;
    if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) safe[k] = v;
  }
  db.insert(auditLog)
    .values({ id: newId('a_'), userId, action, entityType, entityId, meta: JSON.stringify(safe) })
    .run();
}
