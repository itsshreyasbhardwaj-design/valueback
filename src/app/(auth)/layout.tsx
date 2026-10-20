import Link from 'next/link';
import { Wordmark } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg-subtle)]">
      <header className="flex items-center justify-between px-4 py-4 sm:px-6">
        <Wordmark />
        <ThemeToggle compact />
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 py-6 sm:items-center sm:py-10">
        <div className="w-full max-w-md">{children}</div>
      </main>
      <footer className="px-4 py-5 text-center text-xs text-[var(--text-faint)]">
        <Link href="/" className="hover:underline">
          Back to the site
        </Link>
        <span className="mx-2">·</span>
        <Link href="/privacy" className="hover:underline">
          Privacy
        </Link>
        <span className="mx-2">·</span>
        <Link href="/terms" className="hover:underline">
          Terms
        </Link>
      </footer>
    </div>
  );
}
