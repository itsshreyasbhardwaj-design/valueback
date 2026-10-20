import { redirect } from 'next/navigation';
import { after } from 'next/server';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { getSessionUser } from '@/lib/auth';
import { applyRecurringAllowances } from '@/lib/benefits';
import { runDueReminders, unreadNotificationCount } from '@/lib/reminders';
import { PLAN_LIMITS } from '@/lib/entitlements';
import { MobileTabBar, MobileTopBar, Sidebar } from '@/components/app-nav';
import { SearchBox } from '@/components/search-box';
import { NotificationBell } from '@/components/notification-bell';

/**
 * Reminders are processed opportunistically while someone is using the app, and
 * by `npm run reminders:run` otherwise. The sweep runs in `after()` so it never
 * happens during render and never delays the response. Both paths are
 * idempotent (notifications carry a unique dedupe key), so the throttle below
 * is about wasted work, not correctness.
 */
const SWEEP_INTERVAL_MS = 60_000;
const lastSweepByUser = new Map<string, number>();

function sweepIfDue(userId: string): void {
  const last = lastSweepByUser.get(userId) ?? 0;
  if (Date.now() - last < SWEEP_INTERVAL_MS) return;
  lastSweepByUser.set(userId, Date.now());
  try {
    applyRecurringAllowances(userId);
    runDueReminders(undefined, userId);
  } catch {
    // A failed sweep must never affect the page the user asked for.
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/signin');

  after(() => sweepIfDue(user.id));

  const unread = unreadNotificationCount(user.id);

  return (
    <div className="flex min-h-dvh bg-[var(--bg)]">
      <Sidebar
        unread={unread}
        userName={user.name || user.email}
        plan={PLAN_LIMITS[user.plan].label}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar unread={unread} />
        <div className="hidden items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-2.5 lg:flex">
          <SearchBox />
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell unread={unread} />
            <Link
              href="/app/benefits/new"
              className="inline-flex min-h-[2.25rem] items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--accent-contrast)] hover:opacity-90"
            >
              <Plus size={15} aria-hidden /> Add benefit
            </Link>
          </div>
        </div>
        <main id="main" className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
        <MobileTabBar />
      </div>
    </div>
  );
}
