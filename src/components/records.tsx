import Link from 'next/link';
import { AlertTriangle, CalendarClock, ShieldCheck, Tag } from 'lucide-react';
import type { benefits, refundCases } from '@/lib/db/schema';
import { CATEGORY_LABELS, STATUS_LABELS, STATUS_TONES, date as fmtDate, money, parseTags } from '@/lib/format';
import { daysBetween } from '@/lib/dates';
import { evidenceLabel, priorityBand, type Priority } from '@/lib/priority';
import { refundStatusLabel } from '@/lib/refunds';
import { Badge } from './ui';
import type { DisplayPrefs } from '@/lib/format';

type Benefit = typeof benefits.$inferSelect;
type RefundCase = typeof refundCases.$inferSelect;

export function StatusBadge({ status }: { status: Benefit['status'] }) {
  return <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Badge>;
}

export function EvidenceBadge({ evidence }: { evidence: Benefit['evidence'] }) {
  const { label, hint } = evidenceLabel(evidence);
  return (
    <Badge tone={evidence === 'user_entered' ? 'neutral' : 'info'} title={hint}>
      <ShieldCheck size={11} aria-hidden /> {label}
    </Badge>
  );
}

export function ExpiryHint({
  expiresAt,
  today,
  prefs,
}: {
  expiresAt: string | null;
  today: string;
  prefs: Pick<DisplayPrefs, 'dateFormat'>;
}) {
  if (!expiresAt) return <span className="text-xs text-[var(--text-faint)]">No expiry recorded</span>;
  const days = daysBetween(today, expiresAt);
  const tone = days < 0 ? 'danger' : days <= 7 ? 'danger' : days <= 30 ? 'warning' : 'neutral';
  const text =
    days < 0
      ? `Recorded expiry passed ${Math.abs(days)}d ago`
      : days === 0
        ? 'Recorded expiry is today'
        : `Expires in ${days}d · ${fmtDate(expiresAt, prefs)}`;
  return (
    <Badge tone={tone}>
      <CalendarClock size={11} aria-hidden /> {text}
    </Badge>
  );
}

export function BenefitRow({
  benefit,
  today,
  prefs,
  shared,
}: {
  benefit: Benefit;
  today: string;
  prefs: DisplayPrefs;
  shared?: { householdName: string; permission: string };
}) {
  const tags = parseTags(benefit.tags);
  return (
    <li>
      <Link
        href={`/app/benefits/${benefit.id}`}
        className="block px-4 py-3 transition-colors hover:bg-[var(--bg-subtle)] sm:px-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
          <div className="min-w-0">
            <p className="truncate font-medium">{benefit.title}</p>
            <p className="mt-0.5 truncate text-[0.8125rem] text-[var(--text-muted)]">
              {CATEGORY_LABELS[benefit.category]}
              {benefit.merchant ? ` · ${benefit.merchant}` : ''}
            </p>
          </div>
          <div className="text-right">
            {benefit.currentValueMinor != null ? (
              <p className="nums font-semibold">{money(benefit.currentValueMinor, benefit.currency)}</p>
            ) : null}
            {benefit.currentUnits != null ? (
              <p className="nums text-[0.8125rem] text-[var(--text-muted)]">
                {benefit.currentUnits} {benefit.unitLabel || 'units'} left
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={benefit.status} />
          <ExpiryHint expiresAt={benefit.expiresAt} today={today} prefs={prefs} />
          <EvidenceBadge evidence={benefit.evidence} />
          {shared ? <Badge tone="info">Shared in {shared.householdName}</Badge> : null}
          {tags.slice(0, 2).map((t) => (
            <Badge key={t} tone="neutral">
              <Tag size={10} aria-hidden /> {t}
            </Badge>
          ))}
        </div>
      </Link>
    </li>
  );
}

export function RefundRow({
  refundCase,
  today,
  prefs,
  shared,
}: {
  refundCase: RefundCase;
  today: string;
  prefs: DisplayPrefs;
  shared?: { householdName: string };
}) {
  const outstanding = refundCase.amountMinor - refundCase.receivedAmountMinor;
  const overdue =
    refundCase.expectedByDate &&
    daysBetween(today, refundCase.expectedByDate) < 0 &&
    !['received_confirmed', 'closed_without_receipt'].includes(refundCase.status);
  return (
    <li>
      <Link
        href={`/app/refunds/${refundCase.id}`}
        className="block px-4 py-3 transition-colors hover:bg-[var(--bg-subtle)] sm:px-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
          <div className="min-w-0">
            <p className="truncate font-medium">{refundCase.merchant}</p>
            <p className="mt-0.5 truncate text-[0.8125rem] text-[var(--text-muted)]">
              {refundCase.orderRef ? `Order ${refundCase.orderRef}` : 'No order reference recorded'}
            </p>
          </div>
          <div className="text-right">
            <p className="nums font-semibold">{money(outstanding, refundCase.currency)}</p>
            {refundCase.receivedAmountMinor > 0 ? (
              <p className="nums text-[0.8125rem] text-[var(--accent)]">
                {money(refundCase.receivedAmountMinor, refundCase.currency)} confirmed
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge tone={refundCase.status === 'received_confirmed' ? 'positive' : refundCase.status === 'disputed' ? 'danger' : 'neutral'}>
            {refundStatusLabel(refundCase.status)}
          </Badge>
          {overdue ? (
            <Badge tone="danger">
              <AlertTriangle size={11} aria-hidden /> Past the window you recorded
            </Badge>
          ) : refundCase.expectedByDate ? (
            <Badge tone="neutral">
              <CalendarClock size={11} aria-hidden /> Expected by {fmtDate(refundCase.expectedByDate, prefs)}
            </Badge>
          ) : null}
          {shared ? <Badge tone="info">Shared in {shared.householdName}</Badge> : null}
        </div>
      </Link>
    </li>
  );
}

export function AttentionItem({
  href,
  title,
  subtitle,
  amount,
  priority,
}: {
  href: string;
  title: string;
  subtitle: string;
  amount: string;
  priority: Priority;
}) {
  const band = priorityBand(priority.score);
  return (
    <li>
      <Link href={href} className="block px-4 py-3 transition-colors hover:bg-[var(--bg-subtle)] sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            <p className="truncate font-medium">{title}</p>
            <p className="text-[0.8125rem] text-[var(--text-muted)]">{subtitle}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="nums font-semibold">{amount}</span>
            <Badge tone={band.tone === 'urgent' ? 'danger' : band.tone === 'warning' ? 'warning' : 'neutral'}>
              {band.label}
            </Badge>
          </div>
        </div>
        <ul className="mt-1.5 space-y-0.5">
          {priority.reasons.slice(0, 2).map((r) => (
            <li key={r} className="text-[0.8125rem] leading-snug text-[var(--text-muted)]">
              — {r}
            </li>
          ))}
        </ul>
      </Link>
    </li>
  );
}
