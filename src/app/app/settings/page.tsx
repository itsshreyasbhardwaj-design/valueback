import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { parseOffsets } from '@/lib/reminders';
import { resyncRemindersAction } from '../benefits/actions';
import { Card, CardHeader } from '@/components/ui';
import { SubmitButton } from '@/components/form';
import { SettingsForm } from './panels';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card>
          <CardHeader title="Profile and preferences" />
          <SettingsForm
            initial={{
              name: user.name,
              email: user.email,
              currency: user.settings.currency,
              dateFormat: user.settings.dateFormat,
              timeZone: user.settings.timeZone,
              theme: user.settings.theme,
              reminderOffsets: parseOffsets(user.settings.reminderOffsets).join(', '),
              refundCheckInDays: user.settings.refundCheckInDays,
              notifyInApp: user.settings.notifyInApp,
              notifyBrowser: user.settings.notifyBrowser,
              searchDocumentText: user.settings.searchDocumentText,
            }}
          />
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader
            title="Rebuild reminders"
            description="Applies your current reminder schedule to every existing record."
          />
          <form action={resyncRemindersAction} className="p-4">
            <SubmitButton variant="secondary" size="sm" pendingLabel="Rebuilding…">
              Rebuild all expiry reminders
            </SubmitButton>
            <p className="mt-2 text-xs text-[var(--text-faint)]">
              Scheduled reminders are replaced. Ones you already snoozed, completed or cancelled are left
              alone.
            </p>
          </form>
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold">About currencies</h2>
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-[var(--text-muted)]">
            Your preferred currency is used for new records and headline figures. Records in other
            currencies are kept and shown separately — ValueBack has no exchange-rate source, so it will
            not add them together.
          </p>
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold">About the time zone</h2>
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-[var(--text-muted)]">
            Deadlines are calendar dates, not timestamps. The time zone decides when “today” rolls over,
            which is what makes “expires in 1 day” correct for you.
          </p>
        </Card>
      </div>
    </div>
  );
}
