'use client';

import { useEffect } from 'react';

/**
 * Last-resort boundary. It never shows the raw message, because an error from a
 * data path could contain record details.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[valueback] unhandled error', error.digest ?? error.message);
  }, [error]);

  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6 text-center"
    >
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-3 text-[var(--text-muted)]">
        The page could not be shown. Nothing you had already saved is affected — records are only
        written when an action reports success.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-xs text-[var(--text-faint)]">Reference: {error.digest}</p>
      ) : null}
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-contrast)]"
        >
          Try again
        </button>
        <a
          href="/app"
          className="rounded-lg border border-[var(--border-strong)] px-4 py-2 text-sm font-medium"
        >
          Back to the dashboard
        </a>
      </div>
    </main>
  );
}
