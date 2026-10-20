'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Bell,
  FileText,
  Home,
  LogOut,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Users,
  Wallet,
  X,
  Menu,
} from 'lucide-react';
import { signOutAction } from '@/app/(auth)/actions';
import { useState } from 'react';
import { Logo } from './brand';
import { ThemeToggle } from './theme-toggle';
import { cn } from './ui';

const ITEMS = [
  { href: '/app', label: 'Dashboard', icon: Home, exact: true },
  { href: '/app/benefits', label: 'Benefits', icon: Wallet },
  { href: '/app/refunds', label: 'Refunds', icon: RotateCcw },
  { href: '/app/documents', label: 'Documents', icon: FileText },
  { href: '/app/reminders', label: 'Reminders', icon: Bell },
  { href: '/app/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/app/household', label: 'Household', icon: Users },
  { href: '/app/settings', label: 'Settings', icon: Settings },
];

const MOBILE_ITEMS = ITEMS.filter((i) =>
  ['/app', '/app/benefits', '/app/refunds', '/app/reminders'].includes(i.href),
);

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({
  unread,
  userName,
  plan,
}: {
  unread: number;
  userName: string;
  plan: string;
}) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] lg:flex">
      <div className="flex items-center gap-2 px-4 py-4">
        <Logo size={26} />
        <span className="font-semibold tracking-tight">ValueBack</span>
      </div>
      <nav aria-label="Sections" className="flex-1 space-y-0.5 px-2.5">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm',
                active
                  ? 'bg-[var(--accent-soft)] font-semibold text-[var(--accent-soft-text)]'
                  : 'text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]',
              )}
            >
              <Icon size={16} aria-hidden />
              {item.label}
              {item.href === '/app/reminders' && unread > 0 ? (
                <span className="ml-auto rounded-full bg-[var(--warn)] px-1.5 py-0.5 text-[0.625rem] font-bold text-[var(--bg)]">
                  {unread > 99 ? '99+' : unread}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-[var(--border)] p-3">
        <div className="mb-2 truncate px-1 text-xs text-[var(--text-faint)]">
          {userName} · {plan} plan
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <form action={signOutAction}>
            <button
              type="submit"
              className="inline-flex min-h-[2.25rem] items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-2.5 py-1.5 text-[0.8125rem] text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
            >
              <LogOut size={14} aria-hidden /> Sign out
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

export function MobileTopBar({ unread }: { unread: number }) {
  const pathname = usePathname();
  // Storing which route the menu was opened for closes it on navigation
  // without an effect: a new pathname simply stops matching.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === pathname;
  const setOpen = (next: boolean) => setOpenFor(next ? pathname : null);

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 lg:hidden">
        <Link href="/app" className="flex items-center gap-2 font-semibold">
          <Logo size={24} />
          <span className="text-[0.9375rem]">ValueBack</span>
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <Link
            href="/app/search"
            aria-label="Search"
            className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
          >
            <Search size={18} aria-hidden />
          </Link>
          <Link
            href="/app/reminders"
            aria-label={unread > 0 ? `Reminders, ${unread} unread` : 'Reminders'}
            className="relative rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
          >
            <Bell size={18} aria-hidden />
            {unread > 0 ? (
              <span
                className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[var(--warn)]"
                aria-hidden
              />
            ) : null}
          </Link>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
          >
            {open ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
          </button>
        </div>
      </header>

      {open ? (
        <nav
          id="mobile-menu"
          aria-label="Sections"
          className="sticky top-[3.25rem] z-30 grid grid-cols-2 gap-1 border-b border-[var(--border)] bg-[var(--surface)] p-2 lg:hidden"
        >
          {ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm',
                  active
                    ? 'bg-[var(--accent-soft)] font-semibold text-[var(--accent-soft-text)]'
                    : 'text-[var(--text-muted)]',
                )}
              >
                <Icon size={16} aria-hidden />
                {item.label}
              </Link>
            );
          })}
          <form action={signOutAction} className="col-span-2">
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-[var(--text-muted)]"
            >
              <LogOut size={16} aria-hidden /> Sign out
            </button>
          </form>
        </nav>
      ) : null}
    </>
  );
}

export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="sticky bottom-0 z-40 flex items-stretch border-t border-[var(--border)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {MOBILE_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = isActive(pathname, item.href, item.exact);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.625rem]',
              active ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]',
            )}
          >
            <Icon size={19} aria-hidden />
            {item.label}
          </Link>
        );
      })}
      <Link
        href="/app/benefits/new"
        className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.625rem] font-semibold text-[var(--accent)]"
      >
        <span className="flex h-[19px] w-[19px] items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)]">
          <Plus size={13} aria-hidden />
        </span>
        Add
      </Link>
    </nav>
  );
}
