/** Shown while a server component streams. Keeps the shell steady, no spinner jitter. */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="h-7 w-48 rounded bg-[var(--bg-subtle)]" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl border border-[var(--border)] bg-[var(--surface)]" />
        ))}
      </div>
      <div className="h-64 rounded-xl border border-[var(--border)] bg-[var(--surface)]" />
    </div>
  );
}
