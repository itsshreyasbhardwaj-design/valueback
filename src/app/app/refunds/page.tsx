import type { Metadata } from 'next';
import Link from 'next/link';
import { RotateCcw } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { listRefundCases, refundStatusLabel, type RefundFilters } from '@/lib/refunds';
import { REFUND_STATUSES, type RefundStatus } from '@/lib/db/schema';
import { todayIso } from '@/lib/dates';
import { sharedWithMe } from '@/lib/household';
import { Card, EmptyState, LinkButton, PageHeader } from '@/components/ui';
import { RefundRow } from '@/components/records';

export const metadata: Metadata = { title: 'Refunds' };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function RefundsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const prefs = { currency: user.settings.currency, dateFormat: user.settings.dateFormat };
  const today = todayIso(user.settings.timeZone);

  const q = one(sp.q) ?? '';
  const status = one(sp.status) ?? '';
  const view = one(sp.view) ?? 'open';
  const sort = (one(sp.sort) ?? 'updated') as NonNullable<RefundFilters['sort']>;
  const page = Math.max(1, Number(one(sp.page) ?? '1') || 1);

  const { rows, total, pages } = listRefundCases(user.id, {
    q: q || undefined,
    statuses: REFUND_STATUSES.includes(status as RefundStatus) ? [status as RefundStatus] : undefined,
    onlyOpen: view === 'open',
    includeArchived: view === 'all',
    sort,
    page,
    pageSize: 20,
  });

  const shared = sharedWithMe(user.id).refunds;
  const sharedById = new Map(shared.map((s) => [s.refundCase.id, s]));

  return (
    <>
      <PageHeader
        title="RefundWatch"
        description={`${total} ${total === 1 ? 'case' : 'cases'} match these filters. Money only counts as recovered once you confirm it arrived.`}
        action={<LinkButton href="/app/refunds/new" size="sm">Track a refund</LinkButton>}
      />

      <Card className="mb-5 p-3 sm:p-4">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="vb-label" htmlFor="q">
              Search
            </label>
            <input id="q" name="q" type="search" defaultValue={q} placeholder="Merchant, order, notes" className="vb-input" />
          </div>
          <div>
            <label className="vb-label" htmlFor="status">
              Status
            </label>
            <select id="status" name="status" defaultValue={status} className="vb-input">
              <option value="">Any status</option>
              {REFUND_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {refundStatusLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="vb-label" htmlFor="view">
              Showing
            </label>
            <select id="view" name="view" defaultValue={view} className="vb-input">
              <option value="open">Open cases</option>
              <option value="active">All unarchived</option>
              <option value="all">Including archived</option>
            </select>
          </div>
          <div>
            <label className="vb-label" htmlFor="sort">
              Sort by
            </label>
            <select id="sort" name="sort" defaultValue={sort} className="vb-input">
              <option value="updated">Last updated</option>
              <option value="expected">Soonest expected date</option>
              <option value="amount">Largest amount</option>
            </select>
          </div>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <button type="submit" className="min-h-[2.5rem] rounded-lg bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-contrast)]">
              Apply filters
            </button>
            <Link href="/app/refunds" className="text-sm text-[var(--text-muted)] hover:underline">
              Clear
            </Link>
          </div>
        </form>
      </Card>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={<RotateCcw size={26} aria-hidden />}
            title={q || status ? 'Nothing matches those filters' : 'No refund cases yet'}
            description={
              q || status
                ? 'Try clearing the filters.'
                : 'Open a case when you return something or cancel an order, and the follow-up date gets watched for you.'
            }
            action={<LinkButton href="/app/refunds/new" size="sm">Track a refund</LinkButton>}
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {rows.map((r) => (
              <RefundRow
                key={r.id}
                refundCase={r}
                today={today}
                prefs={prefs}
                shared={sharedById.has(r.id) ? { householdName: sharedById.get(r.id)!.household.name } : undefined}
              />
            ))}
          </ul>
        )}
      </Card>

      {pages > 1 ? (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link className="text-[var(--accent)] hover:underline" href={`/app/refunds?view=${view}&page=${page - 1}`}>
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-[var(--text-muted)]">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link className="text-[var(--accent)] hover:underline" href={`/app/refunds?view=${view}&page=${page + 1}`}>
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}
