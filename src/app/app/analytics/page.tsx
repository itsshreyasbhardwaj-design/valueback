import type { Metadata } from 'next';
import Link from 'next/link';
import { BarChart3 } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import {
  categoryBreakdown,
  currenciesInUse,
  expiryBuckets,
  merchantSummary,
  metricsFor,
  monthlyRecovery,
  recentRecovery,
  refundStatusBreakdown,
} from '@/lib/analytics';
import { refundStatusLabel } from '@/lib/refunds';
import { todayIso } from '@/lib/dates';
import { CATEGORY_LABELS, date as fmtDate, money } from '@/lib/format';
import type { BenefitCategory, RefundStatus } from '@/lib/db/schema';
import { Card, CardHeader, EmptyState, LinkButton, PageHeader, Explain } from '@/components/ui';
import { MetricCard } from '@/components/metrics';
import { BarList, CountBarList, MonthlyColumns } from '@/components/charts';

export const metadata: Metadata = { title: 'Analytics' };

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = todayIso(user.settings.timeZone);
  const available = currenciesInUse(user.id, user.settings.currency);
  const requested = typeof sp.currency === 'string' ? sp.currency.toUpperCase() : user.settings.currency;
  const currency = available.includes(requested) ? requested : user.settings.currency;
  const prefs = { dateFormat: user.settings.dateFormat };

  const m = metricsFor(user.id, today);
  const categories = categoryBreakdown(user.id, currency, today);
  const refundStatuses = refundStatusBreakdown(user.id);
  const months = monthlyRecovery(user.id, currency, 12, today);
  const expiry = expiryBuckets(user.id, currency, today);
  const merchants = merchantSummary(user.id, currency, 8);
  const history = recentRecovery(user.id, 25);

  const nothingTracked = m.metric('available_reported').count === 0 && m.metric('pending_refunds').count === 0 && history.length === 0;

  if (nothingTracked) {
    return (
      <>
        <PageHeader title="Analytics" description="Figures appear here once you have records to measure." />
        <Card>
          <EmptyState
            icon={<BarChart3 size={26} aria-hidden />}
            title="Nothing to chart yet"
            description="Add a benefit or a refund case and this page fills in. Every number here is computed from your own records — there is no sample data."
            action={<LinkButton href="/app/benefits/new" size="sm">Add your first benefit</LinkButton>}
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Each figure counts one specific thing. Hover the ? next to a label for its exact definition."
        action={
          available.length > 1 ? (
            <form method="get" className="flex items-end gap-2">
              <label className="sr-only" htmlFor="currency">
                Currency
              </label>
              <select id="currency" name="currency" defaultValue={currency} className="vb-input h-9 py-0 text-sm">
                {available.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button type="submit" className="min-h-[2.25rem] rounded-lg border border-[var(--border-strong)] px-3 text-sm">
                Show
              </button>
            </form>
          ) : null
        }
      />

      {available.length > 1 ? (
        <p className="mb-4 text-sm text-[var(--text-muted)]">
          You have records in {available.join(', ')}. Charts show one currency at a time —
          ValueBack has no exchange-rate source and will not invent one.
        </p>
      ) : null}

      <section aria-labelledby="value-overview" className="mb-6">
        <h2 id="value-overview" className="mb-3 text-base font-semibold">
          Value overview
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {['available_reported', 'verified_available', 'pending_refunds', 'realised_total'].map((k) => (
            <MetricCard key={k} metric={m.metric(k)} currency={currency} />
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {['refunds_received', 'credits_redeemed', 'expiring_soon', 'past_expiry'].map((k) => (
            <MetricCard key={k} metric={m.metric(k)} currency={currency} />
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Confirmed recovery by month"
            description="Only amounts you explicitly confirmed. Last 12 months."
          />
          <div className="p-4">
            <MonthlyColumns data={months} currency={currency} />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Where your outstanding value sits"
            description="Remaining balances by category, excluding anything past its recorded expiry."
          />
          <div className="p-4">
            <BarList
              currency={currency}
              items={categories.map((c) => ({
                label: CATEGORY_LABELS[c.category as BenefitCategory],
                value: c.amount,
                note: `${c.count} ${c.count === 1 ? 'record' : 'records'}`,
              }))}
              emptyLabel="No outstanding value in this currency."
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Expiry exposure"
            description="Outstanding value grouped by how soon its recorded expiry falls."
          />
          <div className="p-4">
            <BarList
              currency={currency}
              items={expiry.map((b) => ({
                label: b.label,
                value: b.amount,
                note: `${b.count} ${b.count === 1 ? 'record' : 'records'}`,
                tone: b.label === '0–7 days' ? 'warn' : 'accent',
              }))}
              emptyLabel="Nothing with a future expiry date in this currency."
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Refund cases by status" description="Counts across every case that is not archived." />
          <div className="p-4">
            <CountBarList
              items={refundStatuses.map((r) => ({
                label: refundStatusLabel(r.status as RefundStatus),
                value: r.count,
                tone: r.status === 'received_confirmed' ? 'accent' : r.status === 'disputed' ? 'warn' : 'neutral',
              }))}
              emptyLabel="No refund cases yet."
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="By merchant" description="Outstanding balances plus refunds still owed." />
          <div className="p-4">
            <BarList
              currency={currency}
              items={merchants.map((x) => ({
                label: x.merchant,
                value: x.total,
                note:
                  x.pendingRefunds > 0
                    ? `${money(x.outstanding, currency)} in credit · ${money(x.pendingRefunds, currency)} owed`
                    : undefined,
              }))}
              emptyLabel="No merchant has any outstanding value in this currency."
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Recovery history"
            description="Every outcome you confirmed, newest first. This list is the whole basis of “confirmed recovered”."
          />
          {history.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
              Nothing confirmed yet. Record a usage or confirm a refund and it appears here.
            </p>
          ) : (
            <ul className="max-h-96 divide-y divide-[var(--border)] overflow-auto">
              {history.map((h) => (
                <li key={h.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm">
                      {h.kind === 'refund_received'
                        ? 'Refund confirmed received'
                        : h.kind === 'credit_redeemed'
                          ? 'Credit recorded as used'
                          : h.kind === 'units_consumed'
                            ? 'Sessions recorded as used'
                            : 'Discount recorded as used'}
                    </p>
                    <p className="text-xs text-[var(--text-faint)]">
                      {fmtDate(h.occurredAt, prefs)}
                      {h.note ? ` · ${h.note}` : ''}
                    </p>
                  </div>
                  <span className="nums shrink-0 text-sm font-semibold text-[var(--accent)]">
                    {h.amountMinor != null ? money(h.amountMinor, h.currency) : `${h.units ?? 0} used`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-5 p-4 sm:p-5">
        <h2 className="text-base font-semibold">
          How these numbers avoid double counting
          <Explain>Outstanding balances and confirmed recoveries come from two separate tables that never overlap.</Explain>
        </h2>
        <div className="mt-3 grid gap-3 text-[0.8125rem] leading-relaxed text-[var(--text-muted)] sm:grid-cols-2">
          <p>
            <strong className="text-[var(--text)]">Outstanding</strong> is read from the current balance on
            each record, which is itself the sum of that record’s ledger. Spend ₹400 of a ₹1,000 credit and
            the record holds ₹600 — the ₹1,000 is gone from this figure the moment the ₹400 is recorded.
          </p>
          <p>
            <strong className="text-[var(--text)]">Confirmed recovered</strong> is read from a separate log of
            outcomes you confirmed: a refund you said arrived, credit you said you spent. The ₹400 appears
            here exactly once, and never also as available.
          </p>
          <p>
            <strong className="text-[var(--text)]">Pending refunds</strong> counts only the part of a case you
            have not confirmed receiving. Confirm half of it and half moves to recovered; nothing is
            counted twice.
          </p>
          <p>
            <strong className="text-[var(--text)]">Subsets are labelled</strong>. “Of which you have verified”
            and “Expiring within 30 days” are slices of the available figure, not extra money. The card
            says so under the number.
          </p>
        </div>
        <p className="mt-3 text-xs text-[var(--text-faint)]">
          Definitions live in <code className="font-mono">src/lib/analytics.ts</code> and are repeated in
          FEATURES.md.{' '}
          <Link href="/app/settings/data" className="underline">
            Export the raw records
          </Link>{' '}
          if you want to check the arithmetic yourself.
        </p>
      </Card>
    </>
  );
}
