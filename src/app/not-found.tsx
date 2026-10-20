import Link from 'next/link';

export default function NotFound() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6 text-center"
    >
      <p className="nums text-sm font-semibold tracking-widest text-[var(--accent)]">404</p>
      <h1 className="mt-2 text-2xl font-semibold">That page does not exist</h1>
      <p className="mt-3 text-[var(--text-muted)]">
        If you expected a record here, it may have been deleted — or it belongs to another account,
        in which case ValueBack deliberately says nothing more than this.
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          href="/app"
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-contrast)]"
        >
          Go to the dashboard
        </Link>
        <Link
          href="/"
          className="rounded-lg border border-[var(--border-strong)] px-4 py-2 text-sm font-medium"
        >
          Back to the site
        </Link>
      </div>
    </main>
  );
}
