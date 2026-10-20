import type { Metadata } from 'next';
import Link from 'next/link';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { BellOff, BellRing, Inbox } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { notifications, reminders } from '@/lib/db/schema';
import { markAllReadAction } from './actions';
import { addDays, daysBetween, todayIso } from '@/lib/dates';
import { date as fmtDate, relativeDays, timestamp } from '@/lib/format';
import { Alert, Badge, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui';
import { SubmitButton } from '@/components/form';
import { BrowserNotifications, MarkReadButton, NewReminderPanel, ReminderActions, RunSchedulerPanel } from './panels';

export const metadata: Metadata = { title: 'Reminders' };

const KIND_LABELS: Record<string, string> = {
  expiry: 'Expiry',
  follow_up: 'Follow-up',
  prepaid_use: 'Prepaid use',
  refund_check_in: 'Refund check-in',
  custom: 'Custom',
};

export default async function RemindersPage() {
  const user = await requireUser();
  const prefs = { dateFormat: user.settings.dateFormat };
  const today = todayIso(user.settings.timeZone);

  const all = db
    .select()
    .from(reminders)
    .where(and(eq(reminders.userId, user.id), inArray(reminders.status, ['scheduled', 'snoozed'])))
    .orderBy(reminders.dueAt)
    .all();

  const overdue = all.filter((r) => daysBetween(today, r.dueAt) < 0);
  const dueToday = all.filter((r) => r.dueAt === today);
  const soon = all.filter((r) => {
    const d = daysBetween(today, r.dueAt);
    return d > 0 && d <= 30;
  });
  const later = all.filter((r) => daysBetween(today, r.dueAt) > 30);

  const unread = db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)))
    .orderBy(desc(notifications.createdAt))
    .limit(50)
    .all();

  const read = db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(30)
    .all()
    .filter((n) => n.readAt);

  const section = (title: string, items: typeof all, tone: 'danger' | 'warning' | 'neutral') =>
    items.length > 0 ? (
      <Card key={title}>
        <CardHeader title={title} description={`${items.length} ${items.length === 1 ? 'reminder' : 'reminders'}`} />
        <ul className="divide-y divide-[var(--border)]">
          {items.map((r) => (
            <li key={r.id} className="px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {r.benefitId ? (
                      <Link href={`/app/benefits/${r.benefitId}`} className="hover:underline">
                        {r.label}
                      </Link>
                    ) : r.refundCaseId ? (
                      <Link href={`/app/refunds/${r.refundCaseId}`} className="hover:underline">
                        {r.label}
                      </Link>
                    ) : (
                      r.label
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-faint)]">
                    {fmtDate(r.dueAt, prefs)} · {relativeDays(daysBetween(today, r.dueAt))} ·{' '}
                    {KIND_LABELS[r.kind] ?? r.kind}
                    {r.status === 'snoozed' ? ' · snoozed' : ''}
                  </p>
                </div>
                <Badge tone={tone}>{r.status === 'snoozed' ? 'Snoozed' : KIND_LABELS[r.kind] ?? r.kind}</Badge>
              </div>
              <div className="mt-2">
                <ReminderActions reminderId={r.id} dueAt={r.dueAt} />
              </div>
            </li>
          ))}
        </ul>
      </Card>
    ) : null;

  return (
    <>
      <PageHeader
        title="Reminders and notifications"
        description="ExpiryGuard watches recorded expiry dates and refund windows. Everything here can be snoozed, moved or switched off."
      />

      <Alert tone="neutral" className="mb-5" title="How delivery actually works">
        Reminders are turned into notifications while ValueBack is running, or when you run the scheduler
        command. Nothing is delivered to a phone or an inbox: there is no push service and no email
        provider in this build.
      </Alert>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {overdue.length + dueToday.length + soon.length + later.length === 0 ? (
            <Card>
              <EmptyState
                icon={<BellOff size={26} aria-hidden />}
                title="No reminders scheduled"
                description="Add an expiry date to a benefit, or open a refund case, and reminders appear here automatically."
              />
            </Card>
          ) : null}
          {section('Overdue', overdue, 'danger')}
          {section('Due today', dueToday, 'warning')}
          {section('Next 30 days', soon, 'neutral')}
          {section('Later', later, 'neutral')}

          <Card>
            <CardHeader
              title="Notification centre"
              description={`${unread.length} unread.`}
              action={
                unread.length > 0 ? (
                  <form action={markAllReadAction}>
                    <SubmitButton variant="ghost" size="sm" pendingLabel="…">
                      Mark all read
                    </SubmitButton>
                  </form>
                ) : null
              }
            />
            {unread.length === 0 && read.length === 0 ? (
              <EmptyState
                icon={<Inbox size={24} aria-hidden />}
                title="Nothing here yet"
                description="When a reminder comes due it turns into a notification, and stays unread until you clear it."
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {[...unread, ...read].map((n) => (
                  <li key={n.id} className={`px-4 py-3 sm:px-5 ${n.readAt ? 'opacity-60' : ''}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {n.benefitId ? (
                            <Link href={`/app/benefits/${n.benefitId}`} className="hover:underline">
                              {n.title}
                            </Link>
                          ) : n.refundCaseId ? (
                            <Link href={`/app/refunds/${n.refundCaseId}`} className="hover:underline">
                              {n.title}
                            </Link>
                          ) : (
                            n.title
                          )}
                        </p>
                        {n.body ? <p className="mt-0.5 text-[0.8125rem] text-[var(--text-muted)]">{n.body}</p> : null}
                        <p className="mt-0.5 text-xs text-[var(--text-faint)]">{timestamp(n.createdAt, prefs)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge tone={n.severity === 'urgent' ? 'danger' : n.severity === 'warning' ? 'warning' : 'neutral'}>
                          {n.severity}
                        </Badge>
                        {!n.readAt ? <MarkReadButton notificationId={n.id} /> : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Add your own reminder" />
            <NewReminderPanel today={today} />
          </Card>

          <Card>
            <CardHeader title="Run the scheduler" description="Idempotent — running it twice does not nag you twice." />
            <RunSchedulerPanel />
          </Card>

          <Card className="p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <BellRing size={15} className="text-[var(--accent)]" aria-hidden /> Browser notifications
            </h2>
            <div className="mt-3">
              <BrowserNotifications
                enabled={user.settings.notifyBrowser}
                pending={unread.slice(0, 3).map((n) => ({ title: n.title, body: n.body }))}
              />
              {!user.settings.notifyBrowser ? (
                <p className="text-[0.8125rem] text-[var(--text-muted)]">
                  Off. Turn them on in{' '}
                  <Link href="/app/settings" className="underline">
                    Settings
                  </Link>{' '}
                  if you want a desktop pop-up while a tab is open.
                </p>
              ) : null}
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-semibold">Your schedule</h2>
            <p className="mt-2 text-[0.8125rem] text-[var(--text-muted)]">
              Expiry reminders fire {user.settings.reminderOffsets.replace(/[[\]]/g, '')} days before the
              recorded date. Refund check-ins happen {user.settings.refundCheckInDays} days after a case is
              opened, or the day after the expected date.
            </p>
            <Link href="/app/settings" className="mt-2 inline-block text-sm text-[var(--accent)] hover:underline">
              Change the schedule
            </Link>
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-semibold">Coming up</h2>
            <p className="mt-2 text-[0.8125rem] text-[var(--text-muted)]">
              {all.filter((r) => daysBetween(today, r.dueAt) >= 0 && r.dueAt <= addDays(today, 7)).length} reminders
              in the next 7 days.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
