import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { AlertTriangle, CheckCircle2, FileText, History, Paperclip, Share2 } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { reminders } from '@/lib/db/schema';
import { getRefundCaseFor, NotFoundError } from '@/lib/authz';
import {
  REFUND_TRANSITIONS,
  buildFollowUpDraft,
  claimActionsFor,
  refundStatusLabel,
  refundTimeline,
} from '@/lib/refunds';
import { documentsFor } from '@/lib/documents';
import { findRefundDuplicates } from '@/lib/duplicates';
import { grantsForRecord, householdsOf, membersOf } from '@/lib/household';
import { scoreRefund, priorityBand } from '@/lib/priority';
import { todayIso } from '@/lib/dates';
import { date as fmtDate, money, timestamp } from '@/lib/format';
import { Alert, Badge, Card, CardHeader, PageHeader } from '@/components/ui';
import { SharePanel } from '../../benefits/[id]/panels';
import {
  ClaimActionPanel,
  CompleteActionButton,
  FollowUpDraft,
  RefundDangerZone,
  RefundReminderPanel,
  TransitionPanel,
} from './panels';
import { RefundForm } from '../refund-form';
import { updateRefundAction } from '../actions';
import { moneyInput } from '@/lib/format';

export const metadata: Metadata = { title: 'Refund case' };

const STATUS_LABELS = Object.fromEntries(
  (
    [
      'requested',
      'accepted',
      'initiated',
      'awaiting_receipt',
      'received_confirmed',
      'partially_received',
      'disputed',
      'closed_without_receipt',
    ] as const
  ).map((s) => [s, refundStatusLabel(s)]),
);

export default async function RefundDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const prefs = { currency: user.settings.currency, dateFormat: user.settings.dateFormat };
  const today = todayIso(user.settings.timeZone);

  let refundCase, access;
  try {
    ({ refundCase, access } = getRefundCaseFor(user.id, id, 'view'));
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const timeline = refundTimeline(refundCase.id);
  const actions = claimActionsFor(refundCase.id);
  const docs = documentsFor({ refundCaseId: refundCase.id });
  const priority = scoreRefund(refundCase, today);
  const band = priorityBand(priority.score);
  const draft = buildFollowUpDraft(refundCase, user.name, prefs.dateFormat);
  const duplicates = access.isOwner ? findRefundDuplicates(user.id, refundCase, 3) : [];
  const grants = access.isOwner ? grantsForRecord('refund_case', refundCase.id) : [];
  const myHouseholds = access.isOwner ? householdsOf(user.id).map((h) => h.household) : [];
  const householdMembers = myHouseholds.flatMap((h) =>
    membersOf(h.id).map((m) => ({ id: m.userId, label: `${m.name || m.email} (${h.name})` })),
  );
  const caseReminders = db
    .select()
    .from(reminders)
    .where(and(eq(reminders.refundCaseId, refundCase.id), eq(reminders.userId, user.id)))
    .all();

  const outstanding = refundCase.amountMinor - refundCase.receivedAmountMinor;
  const canEdit = access.permission === 'edit';

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-[var(--text-muted)]">
        <Link href="/app/refunds" className="hover:underline">
          Refunds
        </Link>
        <span aria-hidden> / </span>
        <span className="text-[var(--text)]">{refundCase.merchant}</span>
      </nav>

      {sp.created ? (
        <Alert tone="positive" className="mb-4">
          Case opened. A check-in reminder has been scheduled.
        </Alert>
      ) : null}
      {!access.isOwner ? (
        <Alert tone="info" className="mb-4">
          Shared with you by your household. You have{' '}
          {access.permission === 'edit' ? 'view and edit' : 'view-only'} access.
        </Alert>
      ) : null}

      <PageHeader
        title={`Refund from ${refundCase.merchant}`}
        description={
          refundCase.orderRef ? `Order ${refundCase.orderRef}` : 'No order reference recorded'
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card className="p-4 sm:p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[0.8125rem] text-[var(--text-muted)]">Still outstanding</p>
                <p className="nums mt-1 text-3xl font-semibold">
                  {money(outstanding, refundCase.currency)}
                </p>
                <p className="nums mt-1 text-sm text-[var(--text-muted)]">
                  of {money(refundCase.amountMinor, refundCase.currency)} expected
                  {refundCase.receivedAmountMinor > 0
                    ? ` · ${money(refundCase.receivedAmountMinor, refundCase.currency)} confirmed received`
                    : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge
                  tone={
                    refundCase.status === 'received_confirmed'
                      ? 'positive'
                      : refundCase.status === 'disputed'
                        ? 'danger'
                        : 'neutral'
                  }
                >
                  {refundStatusLabel(refundCase.status)}
                </Badge>
                {refundCase.expectedByDate ? (
                  <Badge
                    tone={
                      refundCase.expectedByDate < today && outstanding > 0 ? 'danger' : 'neutral'
                    }
                  >
                    Expected by {fmtDate(refundCase.expectedByDate, prefs)}
                  </Badge>
                ) : null}
                {refundCase.archivedAt ? <Badge tone="neutral">Archived</Badge> : null}
              </div>
            </div>

            {refundCase.status === 'received_confirmed' ? (
              <Alert tone="positive" title="You confirmed this arrived" className="mt-4">
                {money(refundCase.receivedAmountMinor, refundCase.currency)} is counted in your
                confirmed recovered total, dated{' '}
                {fmtDate(refundCase.confirmedAt?.slice(0, 10) ?? null, prefs)}.
              </Alert>
            ) : null}

            {priority.reasons.length > 0 ? (
              <div className="mt-4 rounded-lg border border-[var(--border)] p-3">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <AlertTriangle size={14} className="text-[var(--warn)]" aria-hidden />{' '}
                  {band.label}
                </p>
                <ul className="mt-1.5 space-y-1 text-[0.8125rem] text-[var(--text-muted)]">
                  {priority.reasons.map((r) => (
                    <li key={r}>— {r}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>

          {canEdit ? (
            <Card>
              <CardHeader
                title="Move this case on"
                description="Only transitions that make sense are offered, and each one is recorded with who did it."
              />
              <TransitionPanel
                caseId={refundCase.id}
                allowed={[...REFUND_TRANSITIONS[refundCase.status]]}
                labels={STATUS_LABELS}
                today={today}
                currency={refundCase.currency}
                outstandingLabel={money(outstanding, refundCase.currency)}
              />
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Timeline"
              description="Every status change, with the date it happened."
            />
            <ol className="divide-y divide-[var(--border)]">
              {timeline.map((e) => (
                <li key={e.id} className="flex gap-3 px-4 py-3 sm:px-5">
                  <History
                    size={15}
                    className="mt-0.5 shrink-0 text-[var(--text-faint)]"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {e.fromStatus ? `${refundStatusLabel(e.fromStatus)} → ` : ''}
                      {refundStatusLabel(e.toStatus)}
                    </p>
                    {e.amountMinor ? (
                      <p className="nums text-sm text-[var(--accent)]">
                        {money(e.amountMinor, refundCase.currency)} confirmed received
                      </p>
                    ) : null}
                    {e.note ? (
                      <p className="mt-0.5 text-[0.8125rem] text-[var(--text-muted)]">{e.note}</p>
                    ) : null}
                    <p className="mt-0.5 text-xs text-[var(--text-faint)]">
                      {fmtDate(e.occurredAt, prefs)} · recorded {timestamp(e.createdAt, prefs)}
                      {e.actorUserId === user.id ? ' by you' : ' by a household member'}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <CardHeader
              title="Follow-up message"
              description="Drafted locally from this case. Copy it and send it yourself."
            />
            <FollowUpDraft subject={draft.subject} body={draft.body} />
          </Card>

          <Card>
            <CardHeader
              title="Follow-ups you have logged"
              description="A record of what you have already tried."
            />
            {actions.length === 0 ? (
              <p className="px-4 py-5 text-center text-sm text-[var(--text-muted)]">
                Nothing logged yet.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {actions.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{a.summary}</p>
                      <p className="mt-0.5 text-xs text-[var(--text-faint)]">
                        {a.kind.replace(/_/g, ' ')} · {timestamp(a.createdAt, prefs)}
                        {a.dueAt ? ` · next step due ${fmtDate(a.dueAt, prefs)}` : ''}
                        {a.completedAt ? ' · done' : ''}
                      </p>
                    </div>
                    {!a.completedAt && canEdit ? (
                      <CompleteActionButton actionId={a.id} caseId={refundCase.id} />
                    ) : null}
                    {a.completedAt ? (
                      <CheckCircle2
                        size={16}
                        className="shrink-0 text-[var(--accent)]"
                        aria-hidden
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {canEdit ? (
              <ClaimActionPanel caseId={refundCase.id} members={householdMembers} />
            ) : null}
          </Card>

          <Card>
            <CardHeader
              title="Evidence"
              description="Receipts, chat transcripts and confirmation emails."
              action={
                <Link
                  href={`/app/documents?refundCaseId=${refundCase.id}`}
                  className="inline-flex items-center gap-1 text-sm text-[var(--accent)] hover:underline"
                >
                  <Paperclip size={13} aria-hidden /> Attach
                </Link>
              }
            />
            {docs.length === 0 ? (
              <p className="px-4 py-5 text-center text-sm text-[var(--text-muted)]">
                No documents attached yet.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {docs.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/app/documents/${d.id}`}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--bg-subtle)] sm:px-5"
                    >
                      <FileText
                        size={15}
                        className="shrink-0 text-[var(--text-faint)]"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">{d.filename}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {canEdit ? (
            <Card>
              <details>
                <summary className="cursor-pointer px-4 py-3 text-[0.9375rem] font-semibold sm:px-5">
                  Edit case details
                </summary>
                <div className="border-t border-[var(--border)] p-4 sm:p-5">
                  <RefundForm
                    action={updateRefundAction}
                    mode="edit"
                    initial={{
                      id: refundCase.id,
                      merchant: refundCase.merchant,
                      orderRef: refundCase.orderRef,
                      referenceNumber: refundCase.referenceNumber,
                      currency: refundCase.currency,
                      amount: moneyInput(refundCase.amountMinor, refundCase.currency),
                      purchaseDate: refundCase.purchaseDate ?? '',
                      initiatedAt: refundCase.initiatedAt ?? '',
                      expectedByDate: refundCase.expectedByDate ?? '',
                      method: refundCase.method,
                      notes: refundCase.notes,
                    }}
                  />
                </div>
              </details>
            </Card>
          ) : null}

          {duplicates.length > 0 ? (
            <Card>
              <CardHeader
                title="Possible duplicates"
                description="Suggestions only — nothing is merged for you."
              />
              <ul className="divide-y divide-[var(--border)]">
                {duplicates.map((d) => (
                  <li key={d.record.id} className="px-4 py-3 sm:px-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        href={`/app/refunds/${d.record.id}`}
                        className="font-medium hover:underline"
                      >
                        {d.record.merchant} · {money(d.record.amountMinor, d.record.currency)}
                      </Link>
                      <Badge tone={d.strength === 'strong' ? 'warning' : 'neutral'}>
                        {d.strength === 'strong' ? 'Likely the same' : 'Possibly the same'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[0.8125rem] text-[var(--text-muted)]">
                      Matches on {d.signals.join(', ')}.
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Case details" />
            <dl className="divide-y divide-[var(--border)] text-sm">
              {[
                ['Merchant', refundCase.merchant],
                ['Order reference', refundCase.orderRef || 'Not recorded'],
                ['Refund reference', refundCase.referenceNumber || 'Not recorded'],
                ['Purchased', fmtDate(refundCase.purchaseDate, prefs)],
                ['Raised', fmtDate(refundCase.initiatedAt, prefs)],
                ['Expected by', fmtDate(refundCase.expectedByDate, prefs)],
                ['Method', refundCase.method || 'Not recorded'],
                ['Currency', refundCase.currency],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 px-4 py-2">
                  <dt className="text-[var(--text-muted)]">{k}</dt>
                  <dd className="text-right">{v}</dd>
                </div>
              ))}
            </dl>
            {refundCase.notes ? (
              <p className="whitespace-pre-wrap border-t border-[var(--border)] px-4 py-3 text-sm text-[var(--text-muted)]">
                {refundCase.notes}
              </p>
            ) : null}
            {refundCase.closedReason ? (
              <p className="border-t border-[var(--border)] px-4 py-3 text-sm text-[var(--text-muted)]">
                Closed because: {refundCase.closedReason}
              </p>
            ) : null}
          </Card>

          <Card>
            <CardHeader
              title="Reminders"
              description={`${caseReminders.filter((r) => r.status === 'scheduled').length} scheduled.`}
            />
            {caseReminders.length > 0 ? (
              <ul className="divide-y divide-[var(--border)] text-sm">
                {caseReminders.slice(0, 6).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 px-4 py-2">
                    <span className="min-w-0 truncate">{r.label}</span>
                    <span className="shrink-0 text-xs text-[var(--text-faint)]">
                      {fmtDate(r.dueAt, prefs)} · {r.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {canEdit ? <RefundReminderPanel caseId={refundCase.id} today={today} /> : null}
          </Card>

          <Card>
            <CardHeader
              title="Sharing"
              description="Share this case with a household so someone else can chase it."
              action={<Share2 size={15} className="text-[var(--text-faint)]" aria-hidden />}
            />
            <SharePanel
              resourceId={refundCase.id}
              resourceType="refund_case"
              households={myHouseholds}
              grants={grants.map((g) => ({
                householdId: g.household.id,
                householdName: g.household.name,
                permission: g.grant.permission,
              }))}
              isOwner={access.isOwner}
            />
          </Card>

          {canEdit ? (
            <Card>
              <CardHeader title="Archive or delete" />
              <RefundDangerZone
                caseId={refundCase.id}
                archived={Boolean(refundCase.archivedAt)}
                isOwner={access.isOwner}
              />
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
