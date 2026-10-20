import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { AlertTriangle, FileText, History, Paperclip, Pencil, Share2, ShieldCheck } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { reminders } from '@/lib/db/schema';
import { getBenefitFor, NotFoundError } from '@/lib/authz';
import { BENEFIT_TRANSITIONS, benefitHistory, isPastRecordedExpiry } from '@/lib/benefits';
import { documentsFor } from '@/lib/documents';
import { findBenefitDuplicates } from '@/lib/duplicates';
import { grantsForRecord, householdsOf } from '@/lib/household';
import { scoreBenefit, evidenceLabel, priorityBand } from '@/lib/priority';
import { todayIso } from '@/lib/dates';
import { CATEGORY_LABELS, STATUS_LABELS, date as fmtDate, money, parseTags, timestamp } from '@/lib/format';
import { Alert, Badge, Card, CardHeader, LinkButton, PageHeader } from '@/components/ui';
import { EvidenceBadge, ExpiryHint, StatusBadge } from '@/components/records';
import { BalancePanel, CodeReveal, DangerZone, ReminderPanel, SharePanel, StatusControl } from './panels';

export const metadata: Metadata = { title: 'Benefit' };

export default async function BenefitDetailPage({
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

  let benefit, access;
  try {
    ({ benefit, access } = getBenefitFor(user.id, id, 'view'));
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const history = benefitHistory(benefit.id);
  const docs = documentsFor({ benefitId: benefit.id });
  const priority = scoreBenefit(benefit, today);
  const band = priorityBand(priority.score);
  const evidence = evidenceLabel(benefit.evidence);
  const tags = parseTags(benefit.tags);
  const duplicates = access.isOwner ? findBenefitDuplicates(user.id, benefit, 3) : [];
  const grants = access.isOwner ? grantsForRecord('benefit', benefit.id) : [];
  const myHouseholds = access.isOwner ? householdsOf(user.id).map((h) => h.household) : [];
  const benefitReminders = db
    .select()
    .from(reminders)
    .where(and(eq(reminders.benefitId, benefit.id), eq(reminders.userId, user.id)))
    .all();
  const pastExpiry = isPastRecordedExpiry(benefit, today);
  const canEdit = access.permission === 'edit';

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-[var(--text-muted)]">
        <Link href="/app/benefits" className="hover:underline">
          Benefits
        </Link>
        <span aria-hidden> / </span>
        <span className="text-[var(--text)]">{benefit.title}</span>
      </nav>

      {sp.created ? <Alert tone="positive" className="mb-4">Saved. Reminders were scheduled from the expiry date if you set one.</Alert> : null}
      {sp.saved ? <Alert tone="positive" className="mb-4">Changes saved.</Alert> : null}
      {!access.isOwner ? (
        <Alert tone="info" className="mb-4">
          This record belongs to someone in your household. You have {access.permission === 'edit' ? 'view and edit' : 'view-only'} access.
        </Alert>
      ) : null}

      <PageHeader
        title={benefit.title}
        description={`${CATEGORY_LABELS[benefit.category]}${benefit.merchant ? ` · ${benefit.merchant}` : ''}`}
        action={
          canEdit ? (
            <LinkButton href={`/app/benefits/${benefit.id}/edit`} variant="secondary" size="sm">
              <Pencil size={14} aria-hidden /> Edit details
            </LinkButton>
          ) : null
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card className="p-4 sm:p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[0.8125rem] text-[var(--text-muted)]">Remaining, as recorded</p>
                <p className="nums mt-1 text-3xl font-semibold">
                  {benefit.currentValueMinor != null ? money(benefit.currentValueMinor, benefit.currency) : '—'}
                </p>
                {benefit.currentUnits != null ? (
                  <p className="nums mt-1 text-sm text-[var(--text-muted)]">
                    {benefit.currentUnits} {benefit.unitLabel || 'units'} remaining
                    {benefit.originalUnits != null ? ` of ${benefit.originalUnits}` : ''}
                  </p>
                ) : null}
                {benefit.originalValueMinor != null && benefit.originalValueMinor !== benefit.currentValueMinor ? (
                  <p className="nums mt-1 text-sm text-[var(--text-muted)]">
                    Originally {money(benefit.originalValueMinor, benefit.currency)}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge status={benefit.status} />
                <EvidenceBadge evidence={benefit.evidence} />
                <ExpiryHint expiresAt={benefit.expiresAt} today={today} prefs={prefs} />
              </div>
            </div>

            {pastExpiry ? (
              <Alert tone="warning" title="The recorded expiry has passed" className="mt-4">
                ValueBack has not written this off. A date in your notes is evidence about the terms, not
                proof the right has ended. Check with {benefit.merchant || 'the provider'} — if it is still
                valid, record the new expiry as a revalidation below.
              </Alert>
            ) : null}

            {priority.reasons.length > 0 ? (
              <div className="mt-4 rounded-lg border border-[var(--border)] p-3">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <AlertTriangle size={14} className="text-[var(--warn)]" aria-hidden />
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
                title="Record what happened"
                description="Every change is appended to the history below with a reason and a date. Nothing is overwritten."
              />
              <BalancePanel
                benefitId={benefit.id}
                currency={benefit.currency}
                today={today}
                hasUnits={benefit.currentUnits != null}
                unitLabel={benefit.unitLabel ?? ''}
              />
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="History"
              description="Append-only. This ledger is where the balance above comes from."
            />
            {history.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">No entries yet.</p>
            ) : (
              <ol className="divide-y divide-[var(--border)]">
                {history.map((e) => (
                  <li key={e.id} className="flex gap-3 px-4 py-3 sm:px-5">
                    <History size={15} className="mt-0.5 shrink-0 text-[var(--text-faint)]" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-medium">{EVENT_LABELS[e.type]}</p>
                        <p className="nums text-sm">
                          {e.deltaMinor != null ? (
                            <span className={e.deltaMinor < 0 ? 'text-[var(--accent)]' : ''}>
                              {e.deltaMinor > 0 ? '+' : ''}
                              {money(e.deltaMinor, benefit.currency)}
                            </span>
                          ) : null}
                          {e.deltaUnits != null ? (
                            <span className="ml-2 text-[var(--text-muted)]">
                              {e.deltaUnits > 0 ? '+' : ''}
                              {e.deltaUnits} {benefit.unitLabel || 'units'}
                            </span>
                          ) : null}
                        </p>
                      </div>
                      {e.reason ? <p className="mt-0.5 text-[0.8125rem] text-[var(--text-muted)]">{e.reason}</p> : null}
                      <p className="mt-0.5 text-xs text-[var(--text-faint)]">
                        {fmtDate(e.occurredAt, prefs)} · recorded {timestamp(e.createdAt, prefs)}
                        {e.resultingValueMinor != null
                          ? ` · balance after: ${money(e.resultingValueMinor, benefit.currency)}`
                          : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Evidence"
              description="Documents attached to this record."
              action={
                <LinkButton href={`/app/documents?benefitId=${benefit.id}`} variant="secondary" size="sm">
                  <Paperclip size={13} aria-hidden /> Attach
                </LinkButton>
              }
            />
            {docs.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">
                No documents attached. A photo of the card or the confirmation email is useful later.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {docs.map((d) => (
                  <li key={d.id}>
                    <Link href={`/app/documents/${d.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--bg-subtle)] sm:px-5">
                      <FileText size={15} className="shrink-0 text-[var(--text-faint)]" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-sm">{d.filename}</span>
                      <Badge tone={d.extractionStatus === 'ok' ? 'positive' : 'neutral'}>{d.extractionStatus}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {duplicates.length > 0 ? (
            <Card>
              <CardHeader
                title="Possible duplicates"
                description="Suggestions only. Nothing is merged or deleted for you."
              />
              <ul className="divide-y divide-[var(--border)]">
                {duplicates.map((d) => (
                  <li key={d.record.id} className="px-4 py-3 sm:px-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link href={`/app/benefits/${d.record.id}`} className="font-medium hover:underline">
                        {d.record.title}
                      </Link>
                      <Badge tone={d.strength === 'strong' ? 'warning' : 'neutral'}>
                        {d.strength === 'strong' ? 'Likely the same' : 'Possibly the same'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[0.8125rem] text-[var(--text-muted)]">Matches on {d.signals.join(', ')}.</p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Details" />
            <dl className="divide-y divide-[var(--border)] text-sm">
              {[
                ['Provider', benefit.merchant || 'Not recorded'],
                ['Issued', fmtDate(benefit.issuedAt, prefs)],
                ['Received', fmtDate(benefit.receivedAt, prefs)],
                ['Expires', fmtDate(benefit.expiresAt, prefs)],
                ['Last verified', fmtDate(benefit.verifiedAt, prefs)],
                ['Currency', benefit.currency],
                [
                  'Repeats',
                  benefit.recurrence === 'none'
                    ? 'No'
                    : `${benefit.recurrenceUnits ?? 0} ${benefit.unitLabel || 'units'} ${benefit.recurrence}`,
                ],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 px-4 py-2">
                  <dt className="text-[var(--text-muted)]">{k}</dt>
                  <dd className="text-right">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="border-t border-[var(--border)] px-4 py-3">
              <p className="text-xs font-semibold text-[var(--text-muted)]">Evidence basis</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm">
                <ShieldCheck size={14} className="text-[var(--accent)]" aria-hidden /> {evidence.label}
              </p>
              <p className="mt-0.5 text-xs text-[var(--text-faint)]">{evidence.hint}</p>
            </div>
            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 border-t border-[var(--border)] px-4 py-3">
                {tags.map((t) => (
                  <Badge key={t}>{t}</Badge>
                ))}
              </div>
            ) : null}
          </Card>

          {benefit.codeHint ? (
            <Card>
              <CardHeader title="Redemption code" />
              <div className="p-4">
                <CodeReveal benefitId={benefit.id} hint={benefit.codeHint} />
              </div>
            </Card>
          ) : null}

          {benefit.conditions ? (
            <Card>
              <CardHeader title="Conditions" />
              <p className="whitespace-pre-wrap px-4 py-3 text-sm text-[var(--text-muted)]">{benefit.conditions}</p>
            </Card>
          ) : null}

          {benefit.notes ? (
            <Card>
              <CardHeader title="Notes" />
              <p className="whitespace-pre-wrap px-4 py-3 text-sm text-[var(--text-muted)]">{benefit.notes}</p>
            </Card>
          ) : null}

          {canEdit ? (
            <Card>
              <CardHeader title="Status" description={`Currently ${STATUS_LABELS[benefit.status].toLowerCase()}.`} />
              <StatusControl
                benefitId={benefit.id}
                current={benefit.status}
                allowed={[...BENEFIT_TRANSITIONS[benefit.status]]}
                labels={STATUS_LABELS}
              />
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Reminders" description={`${benefitReminders.filter((r) => r.status === 'scheduled').length} scheduled.`} />
            {benefitReminders.length > 0 ? (
              <ul className="divide-y divide-[var(--border)] text-sm">
                {benefitReminders.slice(0, 6).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 px-4 py-2">
                    <span className="min-w-0 truncate">{r.label}</span>
                    <span className="shrink-0 text-xs text-[var(--text-faint)]">
                      {fmtDate(r.dueAt, prefs)} · {r.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {canEdit ? <ReminderPanel benefitId={benefit.id} today={today} /> : null}
          </Card>

          <Card>
            <CardHeader title="Sharing" description="Household members see nothing until you share a record explicitly." action={<Share2 size={15} className="text-[var(--text-faint)]" aria-hidden />} />
            <SharePanel
              resourceId={benefit.id}
              resourceType="benefit"
              households={myHouseholds}
              grants={grants.map((g) => ({
                householdId: g.household.id,
                householdName: g.household.name,
                permission: g.grant.permission,
              }))}
              isOwner={access.isOwner}
            />
          </Card>

          {access.isOwner ? (
            <Card>
              <CardHeader title="Danger zone" description="Archiving is the reversible option — it lives in the status control above." />
              <DangerZone benefitId={benefit.id} isOwner={access.isOwner} />
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

const EVENT_LABELS: Record<string, string> = {
  initial: 'Opening balance',
  usage: 'Used',
  correction: 'Correction',
  verified_update: 'Verified with the provider',
  redeemed: 'Fully redeemed',
  revalidation: 'Revalidated',
  expiry_note: 'Expiry note',
};
