/**
 * Every test file gets its own migrated SQLite database and storage directory,
 * created before the modules under test are imported. Nothing touches the
 * developer's real ./data/valueback.db.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterAll } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'valueback-test-'));
process.env.DATABASE_URL = join(dir, `${randomUUID()}.db`);
process.env.STORAGE_DIR = join(dir, 'storage');
process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString('base64');
process.env.SESSION_TTL_HOURS = '1';
// NODE_ENV is set by Vitest itself; assigning it here would be a type error.

const sqlite = new Database(process.env.DATABASE_URL);
sqlite.pragma('foreign_keys = ON');
migrate(drizzle(sqlite), { migrationsFolder: './drizzle' });
sqlite.close();

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});
