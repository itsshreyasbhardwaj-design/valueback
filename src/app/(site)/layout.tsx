import Link from 'next/link';
import { getSessionUser } from '@/lib/auth';
import { Wordmark } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';
import { LinkButton } from '@/components/ui';

const NAV = [
  { href: '/features', label: 'Features' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/faq', label: 'FAQ' },
];

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <Wordmark />
          <nav aria-label="Main" className="ml-4 hidden gap-1 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle compact />
            {user ? (
              <LinkButton href="/app" size="sm">
                Open ValueBack
              </LinkButton>
            ) : (
              <>
                <LinkButton href="/signin" variant="secondary" size="sm">
                  Sign in
                </LinkButton>
                <LinkButton href="/signup" size="sm" className="hidden sm:inline-flex">
                  Start tracking
                </LinkButton>
              </>
            )}
          </div>
        </div>
        <nav
          aria-label="Main, compact"
          className="flex gap-1 overflow-x-auto border-t border-[var(--border)] px-4 py-1.5 md:hidden"
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="shrink-0 rounded-lg px-3 py-1.5 text-[0.8125rem] text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-4">
          <div className="md:col-span-2">
            <Wordmark />
            <p className="mt-3 max-w-sm text-sm text-[var(--text-muted)]">
              A personal tracker for refunds, gift cards, store credits and prepaid benefits.
              ValueBack organises what you are owed and reminds you to act. It never holds or moves
              money.
            </p>
          </div>
          <div>
            <h2 className="text-sm font-semibold">Product</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-[var(--text-muted)]">
              {NAV.map((i) => (
                <li key={i.href}>
                  <Link className="hover:text-[var(--text)]" href={i.href}>
                    {i.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link className="hover:text-[var(--text)]" href="/contact">
                  Contact and support
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold">Legal</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-[var(--text-muted)]">
              <li>
                <Link className="hover:text-[var(--text)]" href="/privacy">
                  Privacy policy
                </Link>
              </li>
              <li>
                <Link className="hover:text-[var(--text)]" href="/terms">
                  Terms of service
                </Link>
              </li>
            </ul>
            <p className="mt-3 text-xs text-[var(--text-faint)]">
              Legal pages are initial drafts and need review by a qualified lawyer before any public
              launch.
            </p>
          </div>
        </div>
        <div className="border-t border-[var(--border)] px-4 py-4 text-center text-xs text-[var(--text-faint)] sm:px-6">
          ValueBack is not a bank, wallet, payment processor or financial adviser. It stores records
          you enter and never moves money.
        </div>
      </footer>
    </div>
  );
}
