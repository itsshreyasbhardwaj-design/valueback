import Link from 'next/link';
import { Bell } from 'lucide-react';

export function NotificationBell({ unread }: { unread: number }) {
  return (
    <Link
      href="/app/reminders"
      aria-label={
        unread > 0 ? `Reminders and notifications, ${unread} unread` : 'Reminders and notifications'
      }
      className="relative inline-flex min-h-[2.25rem] items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-2.5 py-1.5 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
    >
      <Bell size={15} aria-hidden />
      {unread > 0 ? (
        <span className="rounded-full bg-[var(--warn)] px-1.5 text-[0.6875rem] font-bold text-[var(--bg)]">
          {unread > 99 ? '99+' : unread}
        </span>
      ) : (
        <span className="text-[0.8125rem]">Reminders</span>
      )}
    </Link>
  );
}
