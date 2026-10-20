import { redirect } from 'next/navigation';
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
 * by `npm run reminders:run` otherwise. Both paths are idempotent (notifications
 * carry a unique dedupe key), so the throttle below is about wasted work, not
 * correctness.
 */
let lastSweep = 0;
const SWEEP_INTERVAL_MS = 60_000;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/signin');

  if (Date.now() - lastSweep > SWEEP_INTERVAL_MS) {
    lastSweep = Date.now();
    try {
      applyRecurringAllowances(user.id);
      runDueReminders();
    } catch {
      // A failed sweep must never block the page the user asked for.
    }
  }

  const unread = unreadNotificationCount(user.id);

  return (
    <div className="flex min-h-dvh bg-[var(--bg)]">
      <Sidebar unread={unread} userName={user.name || user.email} plan={PLAN_LIMITS[user.plan].label} />
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
