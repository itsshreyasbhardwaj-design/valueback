import Link from 'next/link';
import { PageHeader } from '@/components/ui';
import { SettingsNav } from './nav';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Your profile, how dates and money are shown, reminders, security and your data."
      />
      <SettingsNav />
      <div className="mt-5">{children}</div>
      <p className="mt-8 text-xs text-[var(--text-faint)]">
        Looking for the legal drafts?{' '}
        <Link href="/privacy" className="underline">
          Privacy
        </Link>{' '}
        ·{' '}
        <Link href="/terms" className="underline">
          Terms
        </Link>
      </p>
    </>
  );
}
