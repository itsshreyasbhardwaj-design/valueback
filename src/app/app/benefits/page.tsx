import type { Metadata } from 'next';
import Link from 'next/link';
import { Wallet } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { listBenefits, distinctMerchants, type BenefitFilters } from '@/lib/benefits';
import { BENEFIT_CATEGORIES, BENEFIT_STATUSES, type BenefitCategory, type BenefitStatus } from '@/lib/db/schema';
import { CATEGORY_LABELS, STATUS_LABELS } from '@/lib/format';
import { todayIso } from '@/lib/dates';
import { sharedWithMe } from '@/lib/household';
import { Alert, Card, EmptyState, LinkButton, PageHeader } from '@/components/ui';
import { BenefitRow } from '@/components/records';

export const metadata: Metadata = { title: 'Benefits' };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function BenefitsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const prefs = { currency: user.settings.currency, dateFormat: user.settings.dateFormat };
  const today = todayIso(user.settings.timeZone);

  const q = one(sp.q) ?? '';
  const category = one(sp.category) ?? '';
  const status = one(sp.status) ?? '';
  const merchant = one(sp.merchant) ?? '';
  const expiring = one(sp.expiring) ?? '';
  const view = one(sp.view) ?? 'active';
  const sort = (one(sp.sort) ?? 'updated') as NonNullable<BenefitFilters['sort']>;
  const page = Math.max(1, Number(one(sp.page) ?? '1') || 1);

  const filters: BenefitFilters = {
    q: q || undefined,
    categories: BENEFIT_CATEGORIES.includes(category as BenefitCategory) ? [category as BenefitCategory] : undefined,
    statuses: BENEFIT_STATUSES.includes(status as BenefitStatus) ? [status as BenefitStatus] : undefined,
    merchant: merchant || undefined,
    expiringWithinDays: expiring ? Number(expiring) : undefined,
    onlyArchived: view === 'archived',
    includeArchived: view === 'all',
    sort,
    page,
    pageSize: 20,
  };

  const { rows, total, pages } = listBenefits(user.id, filters);
  const merchants = distinctMerchants(user.id);
  const shared = sharedWithMe(user.id).benefits;
  const sharedById = new Map(shared.map((s) => [s.benefit.id, s]));

  const qs = (patch: Record<string, string>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, category, status, merchant, expiring, view, sort, ...patch })) {
      if (v) params.set(k, String(v));
    }
    return `/app/benefits?${params.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Benefits"
        description={`${total} ${total === 1 ? 'record' : 'records'} match the filters below.`}
        action={<LinkButton href="/app/benefits/new" size="sm">Add benefit</LinkButton>}
      />

      <Card className="mb-5 p-3 sm:p-4">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <label className="vb-label" htmlFor="q">
              Search
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Title, merchant, notes, tags"
              className="vb-input"
            />
          </div>
          <div>
            <label className="vb-label" htmlFor="category">
              Category
            </label>
            <select id="category" name="category" defaultValue={category} className="vb-input">
              <option value="">All categories</option>
              {BENEFIT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="vb-label" htmlFor="status">
              Status
            </label>
            <select id="status" name="status" defaultValue={status} className="vb-input">
              <option value="">Any status</option>
              {BENEFIT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="vb-label" htmlFor="merchant">
              Merchant
            </label>
            <select id="merchant" name="merchant" defaultValue={merchant} className="vb-input">
              <option value="">All merchants</option>
              {merchants.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="vb-label" htmlFor="expiring">
              Expiring
            </label>
            <select id="expiring" name="expiring" defaultValue={expiring} className="vb-input">
              <option value="">Any time</option>
              <option value="7">Within 7 days</option>
              <option value="30">Within 30 days</option>
              <option value="90">Within 90 days</option>
            </select>
          </div>
          <div>
            <label className="vb-label" htmlFor="view">
              Showing
            </label>
            <select id="view" name="view" defaultValue={view} className="vb-input">
              <option value="active">Active only</option>
              <option value="archived">Archived only</option>
              <option value="all">Active and archived</option>
            </select>
          </div>
          <div>
            <label className="vb-label" htmlFor="sort">
              Sort by
            </label>
            <select id="sort" name="sort" defaultValue={sort} className="vb-input">
              <option value="updated">Last updated</option>
              <option value="expiry">Soonest expiry</option>
              <option value="value">Highest value</option>
              <option value="title">Name</option>
            </select>
          </div>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-6">
            <button
              type="submit"
              className="min-h-[2.5rem] rounded-lg bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-contrast)]"
            >
              Apply filters
            </button>
            <Link href="/app/benefits" className="text-sm text-[var(--text-muted)] hover:underline">
              Clear
            </Link>
          </div>
        </form>
      </Card>

      {shared.length > 0 ? (
        <Alert tone="info" className="mb-4">
          {shared.length === 1 ? 'One record is' : `${shared.length} records are`} shared with you by someone in
          your household. They appear in this list with a badge.
        </Alert>
      ) : null}

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Wallet size={26} aria-hidden />}
            title={q || category || status ? 'Nothing matches those filters' : 'No benefits yet'}
            description={
              q || category || status
                ? 'Try widening the search, or clear the filters to see everything.'
                : 'Add a gift card, a store credit or anything else you have already paid for.'
            }
            action={<LinkButton href="/app/benefits/new" size="sm">Add a benefit</LinkButton>}
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {rows.map((b) => {
              const s = sharedById.get(b.id);
              return (
                <BenefitRow
                  key={b.id}
                  benefit={b}
                  today={today}
                  prefs={prefs}
                  shared={s ? { householdName: s.household.name, permission: s.permission } : undefined}
                />
              );
            })}
          </ul>
        )}
      </Card>

      {pages > 1 ? (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link className="text-[var(--accent)] hover:underline" href={qs({ page: String(page - 1) })}>
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-[var(--text-muted)]">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link className="text-[var(--accent)] hover:underline" href={qs({ page: String(page + 1) })}>
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
