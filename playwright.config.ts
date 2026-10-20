import { defineConfig, devices } from '@playwright/test';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * End-to-end tests run against a production build on port 3100, with their own
 * database, storage directory and encryption key. The developer's real
 * ./data/valueback.db is never touched.
 */
const ROOT = resolve(process.env.E2E_DIR ?? './.playwright');
const PORT = 3100;

process.env.E2E_DATABASE_URL = resolve(ROOT, 'e2e.db');
process.env.E2E_STORAGE_DIR = resolve(ROOT, 'storage');
process.env.E2E_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');

/**
 * The database is reset here, as the config loads, rather than in globalSetup.
 * Playwright starts `webServer` BEFORE globalSetup runs, and the server opens
 * the SQLite file on boot — deleting it afterwards leaves the server reading a
 * deleted inode, so every query returns nothing.
 */
function resetDatabase() {
  const dbPath = process.env.E2E_DATABASE_URL!;
  for (const suffix of ['', '-wal', '-shm']) rmSync(`${dbPath}${suffix}`, { force: true });
  rmSync(process.env.E2E_STORAGE_DIR!, { recursive: true, force: true });
  mkdirSync(dirname(dbPath), { recursive: true });
  mkdirSync(process.env.E2E_STORAGE_DIR!, { recursive: true });

  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  migrate(drizzle(sqlite), { migrationsFolder: './drizzle' });
  sqlite.close();
}

resetDatabase();

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // one SQLite file, one writer
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /responsive\.spec\.ts/,
    },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 300_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      DATABASE_URL: process.env.E2E_DATABASE_URL,
      STORAGE_DIR: process.env.E2E_STORAGE_DIR,
      APP_ENCRYPTION_KEY: process.env.E2E_ENCRYPTION_KEY,
      SESSION_TTL_HOURS: '2',
    },
  },
});
