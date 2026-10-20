import type { Metadata } from 'next';
import Link from 'next/link';
import { and, desc, eq, isNull, inArray, gte, isNotNull, lte, asc } from 'drizzle-orm';
import { ArrowRight, BellRing, CheckCircle2, Inbox, Wallet } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { benefits, refundCases } from '@/lib/db/schema';
import { visibleBenefitWhere, visibleRefundWhere } from '@/lib/authz';
import { OUTSTANDING_STATUSES } from '@/lib/benefits';
import { OPEN_REFUND_STATUSES } from '@/lib/refunds';
import { currenciesInUse, metricsFor, monthlyRecovery, recentRecovery } from '@/lib/analytics';
import { upcomingReminders } from '@/lib/reminders';
import { scoreBenefit, scoreRefund } from '@/lib/priority';
import { addDays, daysBetween, todayIso } from '@/lib/dates';
import { CATEGORY_LABELS, date as fmtDate, money, pluralise } from '@/lib/format';
import { Card, CardHeader, EmptyState, LinkButton, PageHeader, Badge } from '@/components/ui';
import { MetricCard, StatTile } from '@/components/metrics';
import { MonthlyColumns } from '@/components/charts';
import { AttentionItem, BenefitRow, RefundRow } from '@/components/records';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const user = await requireUser();
  const prefs = { currency: user.settings.currency, dateFormat: user.settings.dateFormat };
  const today = todayIso(user.settings.timeZone);

  const m = metricsFor(user.id, today);
  const currencies = currenciesInUse(user.id, prefs.currency);

  const outstandingBenefits = db
    .select()
    .from(benefits)
    .where(
      and(
        visibleBenefitWhere(user.id),
        isNull(benefits.archivedAt),
        inArray(benefits.status, OUTSTANDING_STATUSES),
      ),
    )
    .all();

  const openRefunds = db
    .select()
    .from(refundCases)
    .where(
      and(
        visibleRefundWhere(user.id),
        isNull(refundCases.archivedAt),
        inArray(refundCases.status, OPEN_REFUND_STATUSES),
      ),
    )
    .all();

  const attention = [
    ...outstandingBenefits.map((b) => ({
      kind: 'benefit' as const,
      record: b,
      priority: scoreBenefit(b, today),
    })),
    ...openRefunds.map((r) => ({
      kind: 'refund' as const,
      record: r,
      priority: scoreRefund(r, today),
    })),
  ]
    .filter((x) => x.priority.score >= 20)
    .sort((a, b) => b.priority.score - a.priority.score)
    .slice(0, 6);

  const deadlines = db
    .select()
    .from(benefits)
    .where(
      and(
        visibleBenefitWhere(user.id),
        isNull(benefits.archivedAt),
        inArray(benefits.status, OUTSTANDING_STATUSES),
        isNotNull(benefits.expiresAt),
        gte(benefits.expiresAt, today),
        lte(benefits.expiresAt, addDays(today, 90)),
      ),
    )
    .orderBy(asc(benefits.expiresAt))
    .limit(6)
    .all();

  const recentBenefits = db
    .select()
    .from(benefits)
    .where(and(visibleBenefitWhere(user.id), isNull(benefits.archivedAt)))
    .orderBy(desc(benefits.updatedAt))
    .limit(5)
    .all();

  const activity = recentRecovery(user.id, 6);
  const months = monthlyRecovery(user.id, prefs.currency, 6, today);
  const reminders = upcomingReminders(user.id, 30, today).slice(0, 5);
  const totalRecords = outstandingBenefits.length + openRefunds.length;
  const isEmpty =
    db.select({ id: benefits.id }).from(benefits).where(eq(benefits.userId, user.id)).limit(1).all()
      .length === 0 &&
    db
      .select({ id: refundCases.id })
      .from(refundCases)
      .where(eq(refundCases.userId, user.id))
      .limit(1)
      .all().length === 0;

  if (isEmpty) {
    return (
      <>
        <PageHeader
          title={`Welcome${user.name ? `, ${user.name.split(' ')[0]}` : ''}`}
          description="Your dashboard fills in as you add records. Start with the one you were most worried about forgetting."
        />
        <Card>
          <EmptyState
            icon={<Wallet size={28} aria-hidden />}
            title="Nothing tracked yet"
            description="Add a gift card, a store credit or a refund you are still waiting on. It takes under a minute, and ValueBack watches the deadline from then on."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <LinkButton href="/app/benefits/new">Add your first benefit</LinkButton>
                <LinkButton href="/app/refunds/new" variant="secondary">
                  Track a refund
                </LinkButton>
                <LinkButton href="/app/documents" variant="secondary">
                  Upload a receipt
                </LinkButton>
              </div>
            }
          />
        </Card>
        <p className="mt-4 text-center text-sm text-[var(--text-muted)]">
          Prefer to look around first?{' '}
          <Link href="/app/onboarding" className="underline">
            Run through the quick setup
          </Link>
          .
        </p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          currencies.length > 1
            ? `Amounts are shown in ${prefs.currency}. Other currencies are listed separately — ValueBack never converts between them.`
            : 'Reported, pending and confirmed amounts are kept apart on purpose.'
        }
        action={
          <>
            <LinkButton href="/app/benefits/new" size="sm">
              Add benefit
            </LinkButton>
            <LinkButton href="/app/refunds/new" size="sm" variant="secondary">
              Add refund
            </LinkButton>
          </>
        }
      />

      <section aria-labelledby="overview-heading">
        <h2 id="overview-heading" className="sr-only">
          Overview
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            metric={m.metric('available_reported')}
            currency={prefs.currency}
            href="/app/benefits"
          />
          <MetricCard metric={m.metric('verified_available')} currency={prefs.currency} />
          <MetricCard
            metric={m.metric('pending_refunds')}
            currency={prefs.currency}
            href="/app/refunds"
          />
          <MetricCard
            metric={m.metric('realised_total')}
            currency={prefs.currency}
            href="/app/analytics"
          />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            metric={m.metric('expiring_soon')}
            currency={prefs.currency}
            href="/app/benefits?expiring=30"
          />
          <MetricCard
            metric={m.metric('past_expiry')}
            currency={prefs.currency}
            href="/app/benefits?status=past_expiry"
          />
          <StatTile
            label="Unresolved claims"
            value={m.unresolvedClaims}
            note="refund cases still open"
            explain="Refund cases that are not confirmed as received and not closed."
          />
          <StatTile
            label="Upcoming actions"
            value={m.upcomingActions}
            note="reminders due in 14 days"
            explain="Reminders scheduled or snoozed with a due date in the next 14 days."
          />
        </div>
      </section>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader
              title="Needs attention"
              description="Ranked by recorded deadlines, outstanding amounts and how long something has sat untouched."
              action={
                attention.length ? (
                  <Link
                    href="/app/benefits?sort=expiry"
                    className="text-sm text-[var(--accent)] hover:underline"
                  >
                    See all
                  </Link>
                ) : null
              }
            />
            {attention.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 size={24} aria-hidden />}
                title="Nothing is urgent right now"
                description={`${pluralise(totalRecords, 'open record')} tracked, none near a recorded deadline.`}
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {attention.map((a) =>
                  a.kind === 'benefit' ? (
                    <AttentionItem
                      key={a.record.id}
                      href={`/app/benefits/${a.record.id}`}
                      title={a.record.title}
                      subtitle={`${CATEGORY_LABELS[a.record.category]}${a.record.merchant ? ` · ${a.record.merchant}` : ''}`}
                      amount={
                        a.record.currentValueMinor != null
                          ? money(a.record.currentValueMinor, a.record.currency)
                          : `${a.record.currentUnits ?? 0} ${a.record.unitLabel || 'units'}`
                      }
                      priority={a.priority}
                    />
                  ) : (
                    <AttentionItem
                      key={a.record.id}
                      href={`/app/refunds/${a.record.id}`}
                      title={`Refund from ${a.record.merchant}`}
                      subtitle={a.record.orderRef ? `Order ${a.record.orderRef}` : 'Refund case'}
                      amount={money(
                        a.record.amountMinor - a.record.receivedAmountMinor,
                        a.record.currency,
                      )}
                      priority={a.priority}
                    />
                  ),
                )}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="My benefits"
              description="Most recently added or updated."
              action={
                <Link href="/app/benefits" className="text-sm text-[var(--accent)] hover:underline">
                  All benefits
                </Link>
              }
            />
            {recentBenefits.length === 0 ? (
              <EmptyState
                icon={<Wallet size={24} aria-hidden />}
                title="No benefits yet"
                description="Gift cards, credits, coupons and prepaid packs all live here."
                action={
                  <LinkButton href="/app/benefits/new" size="sm">
                    Add a benefit
                  </LinkButton>
                }
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {recentBenefits.map((b) => (
                  <BenefitRow key={b.id} benefit={b} today={today} prefs={prefs} />
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Pending refunds"
              description="Cases where you have not yet confirmed the money arrived."
              action={
                <Link href="/app/refunds" className="text-sm text-[var(--accent)] hover:underline">
                  All refunds
                </Link>
              }
            />
            {openRefunds.length === 0 ? (
              <EmptyState
                icon={<Inbox size={24} aria-hidden />}
                title="No open refund cases"
                description="When a merchant owes you money, track it here from the day you raise it."
                action={
                  <LinkButton href="/app/refunds/new" size="sm">
                    Track a refund
                  </LinkButton>
                }
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {openRefunds.slice(0, 5).map((r) => (
                  <RefundRow key={r.id} refundCase={r} today={today} prefs={prefs} />
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Upcoming deadlines"
              description="Recorded expiry dates in the next 90 days."
            />
            {deadlines.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">
                Nothing with a recorded expiry in the next 90 days.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {deadlines.map((b) => {
                  const days = daysBetween(today, b.expiresAt!);
                  return (
                    <li key={b.id}>
                      <Link
                        href={`/app/benefits/${b.id}`}
                        className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-[var(--bg-subtle)]"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{b.title}</p>
                          <p className="text-xs text-[var(--text-faint)]">
                            {fmtDate(b.expiresAt, prefs)}
                          </p>
                        </div>
                        <Badge tone={days <= 7 ? 'danger' : days <= 30 ? 'warning' : 'neutral'}>
                          {days}d
                        </Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Reminders"
              description="Next 30 days."
              action={
                <Link
                  href="/app/reminders"
                  className="text-sm text-[var(--accent)] hover:underline"
                >
                  Open
                </Link>
              }
            />
            {reminders.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">
                No reminders scheduled in the next 30 days.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {reminders.map((r) => (
                  <li key={r.id} className="flex items-start gap-2.5 px-4 py-2.5">
                    <BellRing
                      size={14}
                      className="mt-0.5 shrink-0 text-[var(--text-faint)]"
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm">{r.label}</p>
                      <p className="text-xs text-[var(--text-faint)]">{fmtDate(r.dueAt, prefs)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Recovery activity"
              description="Only outcomes you confirmed yourself."
              action={
                <Link
                  href="/app/analytics"
                  className="text-sm text-[var(--accent)] hover:underline"
                >
                  Analytics
                </Link>
              }
            />
            <div className="px-4 py-3">
              <MonthlyColumns data={months} currency={prefs.currency} />
            </div>
            {activity.length > 0 ? (
              <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
                {activity.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm">
                        {a.kind === 'refund_received'
                          ? 'Refund confirmed received'
                          : a.kind === 'credit_redeemed'
                            ? 'Credit recorded as used'
                            : a.kind === 'units_consumed'
                              ? 'Sessions recorded as used'
                              : 'Discount recorded as used'}
                      </p>
                      <p className="text-xs text-[var(--text-faint)]">
                        {fmtDate(a.occurredAt, prefs)}
                      </p>
                    </div>
                    <span className="nums shrink-0 text-sm font-semibold text-[var(--accent)]">
                      {a.amountMinor != null
                        ? money(a.amountMinor, a.currency)
                        : `${a.units ?? 0} used`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          <Card className="p-4">
            <p className="text-sm font-semibold">Keep the numbers honest</p>
            <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-[var(--text-muted)]">
              Check a real balance with the provider now and then, and record it as a verified
              update. The dashboard shows which records have never been checked.
            </p>
            <Link
              href="/app/benefits?evidence=user_entered"
              className="mt-2.5 inline-flex items-center gap-1 text-sm text-[var(--accent)] hover:underline"
            >
              See unchecked records <ArrowRight size={14} aria-hidden />
            </Link>
          </Card>
        </div>
      </div>
    </>
  );
}
