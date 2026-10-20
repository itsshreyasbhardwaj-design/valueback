import { randomBytes } from 'node:crypto';

/**
 * Lexicographically sortable opaque id: 8 chars of base36 time + 16 chars random.
 * ponytail: not a full ULID spec — sortable + unguessable is all we need here.
 */
export function newId(prefix = ''): string {
  const t = Date.now().toString(36).padStart(9, '0');
  const r = randomBytes(10).toString('hex').slice(0, 16);
  return `${prefix}${t}${r}`;
}
