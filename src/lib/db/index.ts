import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as schema from './schema';

export const DB_PATH = resolve(/* turbopackIgnore: true */ process.env.DATABASE_URL ?? './data/valueback.db');

function connect() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);
  // WAL: concurrent readers while one writer commits.
  sqlite.pragma('journal_mode = WAL');
  // SQLite does NOT enforce foreign keys unless asked, per connection.
  sqlite.pragma('foreign_keys = ON');
  // Wait instead of throwing SQLITE_BUSY when another request holds the write lock.
  sqlite.pragma('busy_timeout = 5000');
  return drizzle(sqlite, { schema });
}

// Next.js dev server re-evaluates modules on hot reload; one connection per process.
const g = globalThis as unknown as { __vbDb?: ReturnType<typeof connect> };
export const db = g.__vbDb ?? connect();
if (process.env.NODE_ENV !== 'production') g.__vbDb = db;

export { schema };
export type Db = typeof db;
