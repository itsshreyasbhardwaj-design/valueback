import type { Metadata } from 'next';
import Link from 'next/link';
import { FileText, Search as SearchIcon } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { search } from '@/lib/search';
import { todayIso } from '@/lib/dates';
import { Card, CardHeader, EmptyState, PageHeader } from '@/components/ui';
import { BenefitRow, RefundRow } from '@/components/records';

export const metadata: Metadata = { title: 'Search' };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q : '';
  const prefs = { currency: user.settings.currency, dateFormat: user.settings.dateFormat };
  const today = todayIso(user.settings.timeZone);

  const results = q
    ? search(user.id, q, { includeDocumentText: user.settings.searchDocumentText })
    : { benefits: [], refunds: [], documents: [], total: 0 };

  return (
    <>
      <PageHeader
        title="Search"
        description="Titles, merchants, notes, tags, conditions and order references. Redemption codes are encrypted and deliberately not searchable."
      />

      <Card className="mb-5 p-4">
        <form method="get" role="search" className="flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1">
            <label className="vb-label" htmlFor="q">
              Search your records
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={q}
              autoFocus
              className="vb-input"
              placeholder="e.g. Lifestyle, 4432, yoga"
            />
          </div>
          <button
            type="submit"
            className="min-h-[2.5rem] rounded-lg bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-contrast)]"
          >
            Search
          </button>
        </form>
        {!user.settings.searchDocumentText ? (
          <p className="mt-2 text-xs text-[var(--text-faint)]">
            Document text is excluded from search because you turned that off in{' '}
            <Link href="/app/settings" className="underline">
              Settings
            </Link>
            .
          </p>
        ) : null}
      </Card>

      {!q ? (
        <Card>
          <EmptyState
            icon={<SearchIcon size={26} aria-hidden />}
            title="Type something to search"
            description="Two characters or more. Results are grouped by benefits, refund cases and documents."
          />
        </Card>
      ) : results.total === 0 ? (
        <Card>
          <EmptyState
            icon={<SearchIcon size={26} aria-hidden />}
            title={`Nothing matched “${q}”`}
            description="Try a shorter word, a merchant name, or part of an order reference."
          />
        </Card>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-[var(--text-muted)]">
            {results.total} {results.total === 1 ? 'match' : 'matches'} for “{q}”.
          </p>

          {results.benefits.length > 0 ? (
            <Card>
              <CardHeader title={`Benefits (${results.benefits.length})`} />
              <ul className="divide-y divide-[var(--border)]">
                {results.benefits.map((b) => (
                  <BenefitRow key={b.id} benefit={b} today={today} prefs={prefs} />
                ))}
              </ul>
            </Card>
          ) : null}

          {results.refunds.length > 0 ? (
            <Card>
              <CardHeader title={`Refund cases (${results.refunds.length})`} />
              <ul className="divide-y divide-[var(--border)]">
                {results.refunds.map((r) => (
                  <RefundRow key={r.id} refundCase={r} today={today} prefs={prefs} />
                ))}
              </ul>
            </Card>
          ) : null}

          {results.documents.length > 0 ? (
            <Card>
              <CardHeader
                title={`Documents (${results.documents.length})`}
                description="Matched on the filename or the text read from the file."
              />
              <ul className="divide-y divide-[var(--border)]">
                {results.documents.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/app/documents/${d.id}`}
                      className="flex gap-3 px-4 py-3 hover:bg-[var(--bg-subtle)] sm:px-5"
                    >
                      <FileText
                        size={15}
                        className="mt-0.5 shrink-0 text-[var(--text-faint)]"
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{d.filename}</p>
                        {d.excerpt ? (
                          <p className="mt-0.5 text-[0.8125rem] text-[var(--text-muted)]">
                            {d.excerpt}
                          </p>
                        ) : null}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      )}
    </>
  );
}
