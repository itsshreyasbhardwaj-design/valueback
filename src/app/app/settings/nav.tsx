'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/components/ui';

const TABS = [
  { href: '/app/settings', label: 'Profile and preferences' },
  { href: '/app/settings/security', label: 'Security' },
  { href: '/app/settings/data', label: 'Data and plan' },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto border-b border-[var(--border)]">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'shrink-0 border-b-2 px-3 py-2 text-sm',
              active
                ? 'border-[var(--accent)] font-semibold text-[var(--text)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]',
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
