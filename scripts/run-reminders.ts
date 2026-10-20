/**
 * Processes due reminders into notifications.
 *
 * Run it from cron or a launchd job if you want reminders to appear without
 * opening the app:
 *   cd /path/to/valueback && npm run reminders:run
 *
 * Safe to run as often as you like: notifications carry a unique dedupe key per
 * (user, reminder, due date), so a second run on the same day creates nothing.
 */
import { lt } from 'drizzle-orm';
import { db } from '../src/lib/db/index.ts';
import { sessions } from '../src/lib/db/schema.ts';
import { runDueReminders } from '../src/lib/reminders.ts';
import { applyRecurringAllowances } from '../src/lib/benefits.ts';
import { nowIso, todayIso } from '../src/lib/dates.ts';
import { users } from '../src/lib/db/schema.ts';

const today = todayIso();

let topUps = 0;
for (const u of db.select({ id: users.id }).from(users).all()) {
  topUps += applyRecurringAllowances(u.id, today);
}

const result = runDueReminders(today);
const purged = db.delete(sessions).where(lt(sessions.expiresAt, nowIso())).run().changes;

console.log(
  `[${today}] ${result.scanned} due reminder(s) scanned, ${result.fired} notification(s) created, ` +
    `${topUps} recurring allowance(s) topped up, ${purged} expired session(s) purged.`,
);
