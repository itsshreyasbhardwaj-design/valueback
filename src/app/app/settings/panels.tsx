'use client';

import { useActionState, useState } from 'react';
import { Copy, KeyRound } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/form';
import { Alert, Button, Checkbox, Field, Input, Select } from '@/components/ui';
import { SUPPORTED_CURRENCIES } from '@/lib/money';
import type { FormState } from '@/lib/validation';
import {
  changePasswordAction,
  deleteAccountAction,
  generateRecoveryCodesAction,
  importBenefitsAction,
  revokeOtherSessionsAction,
  setPlanAction,
  updateSettingsAction,
} from './actions';

export type SettingsValues = {
  name: string;
  email: string;
  currency: string;
  dateFormat: string;
  timeZone: string;
  theme: string;
  reminderOffsets: string;
  refundCheckInDays: number;
  notifyInApp: boolean;
  notifyBrowser: boolean;
  searchDocumentText: boolean;
};

const TIME_ZONES = [
  'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'Europe/Berlin',
  'America/New_York', 'America/Los_Angeles', 'Australia/Sydney', 'UTC',
];

export function SettingsForm({ initial }: { initial: SettingsValues }) {
  const [state, action] = useActionState<FormState, FormData>(updateSettingsAction, {});
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />

      <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
        <Field label="Your name" name="name" error={state.errors?.name}>
          <Input id="name" name="name" defaultValue={initial.name} maxLength={80} />
        </Field>
        <Field label="Account email" name="email" hint="Used to sign in. Changing it is not supported in this build.">
          <Input id="email" name="email" value={initial.email} readOnly disabled />
        </Field>

        <Field label="Preferred currency" name="currency" error={state.errors?.currency} hint="Used for new records and as the main currency on the dashboard.">
          <Select id="currency" name="currency" defaultValue={initial.currency}>
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date format" name="dateFormat" error={state.errors?.dateFormat}>
          <Select id="dateFormat" name="dateFormat" defaultValue={initial.dateFormat}>
            <option value="dd/MM/yyyy">31/12/2026</option>
            <option value="MM/dd/yyyy">12/31/2026</option>
            <option value="yyyy-MM-dd">2026-12-31</option>
          </Select>
        </Field>
        <Field label="Time zone" name="timeZone" error={state.errors?.timeZone} hint="Decides what “today” means for deadlines.">
          <Select id="timeZone" name="timeZone" defaultValue={initial.timeZone}>
            {TIME_ZONES.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Theme" name="theme" error={state.errors?.theme}>
          <Select id="theme" name="theme" defaultValue={initial.theme}>
            <option value="system">Match the system</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </Select>
        </Field>

        <Field
          label="Expiry reminder days"
          name="reminderOffsets"
          error={state.errors?.reminderOffsets}
          hint="Days before an expiry date, separated by commas."
        >
          <Input id="reminderOffsets" name="reminderOffsets" defaultValue={initial.reminderOffsets} className="nums" />
        </Field>
        <Field
          label="Refund check-in after"
          name="refundCheckInDays"
          error={state.errors?.refundCheckInDays}
          hint="Days after opening a case, when no expected date is known."
        >
          <Input id="refundCheckInDays" name="refundCheckInDays" type="number" min={1} max={90} defaultValue={initial.refundCheckInDays} className="nums" />
        </Field>

        <div className="sm:col-span-2">
          <p className="vb-label">Notifications and privacy</p>
          <Checkbox name="notifyInApp" defaultChecked={initial.notifyInApp} label="Show reminders in the in-app notification centre" />
          <Checkbox
            name="notifyBrowser"
            defaultChecked={initial.notifyBrowser}
            label="Also raise browser notifications"
            hint="Only works while a ValueBack tab is open and you have granted permission. Nothing is delivered once the app is closed."
          />
          <Checkbox
            name="searchDocumentText"
            defaultChecked={initial.searchDocumentText}
            label="Include text read from documents in search results"
            hint="Turn this off if you would rather receipt contents never appeared in a search."
          />
        </div>
      </div>

      <div className="px-4 pb-4 sm:px-5">
        <SubmitButton pendingLabel="Saving…">Save settings</SubmitButton>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(changePasswordAction, {});
  return (
    <form action={action} className="space-y-4 p-4 sm:p-5" noValidate>
      <FormMessage state={state} />
      <Field label="Current password" name="currentPassword" required error={state.errors?.currentPassword}>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="New password" name="newPassword" required error={state.errors?.newPassword} hint="At least 10 characters.">
        <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={10} required />
      </Field>
      <Field label="Confirm new password" name="confirmPassword" required error={state.errors?.confirmPassword}>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton pendingLabel="Changing…">Change password</SubmitButton>
    </form>
  );
}

export function RecoveryCodesPanel({ existing }: { existing: number }) {
  const [state, action] = useActionState<FormState, FormData>(generateRecoveryCodesAction, {});
  const codes = Array.isArray(state.payload?.codes) ? (state.payload.codes as string[]) : null;
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <Alert tone={existing > 0 ? 'neutral' : 'warning'} title={existing > 0 ? `${existing} unused codes exist` : 'You have no recovery codes'}>
        There is no password-reset email in this build. A recovery code is the only way back into this
        account if you forget the password. Generating a new set replaces any existing codes.
      </Alert>

      {codes ? (
        <Alert tone="positive" title="Save these now — they are shown once">
          <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-sm">
            {codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => {
              void navigator.clipboard?.writeText(codes.join('\n')).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              });
            }}
          >
            <Copy size={13} aria-hidden /> {copied ? 'Copied' : 'Copy all codes'}
          </Button>
          <p className="mt-2 text-xs">
            Only a hash of each code is stored, so nobody — including whoever runs this installation —
            can read them back out of the database.
          </p>
        </Alert>
      ) : null}

      <form action={action} className="space-y-3" noValidate>
        <FormMessage state={state} />
        <Field label="Confirm your password" name="password" required error={state.errors?.password}>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <SubmitButton variant="secondary" pendingLabel="Generating…">
          <KeyRound size={14} aria-hidden /> Generate 8 recovery codes
        </SubmitButton>
      </form>
    </div>
  );
}

export function RevokeSessionsPanel({ count }: { count: number }) {
  const [state, action] = useActionState<FormState, FormData>(revokeOtherSessionsAction, {});
  return (
    <form action={action} className="space-y-3 p-4">
      <p className="text-sm text-[var(--text-muted)]">
        {count === 1 ? 'This is your only active session.' : `${count} sessions are currently active.`}
      </p>
      <FormMessage state={state} />
      <SubmitButton variant="secondary" size="sm" pendingLabel="Signing out…" disabled={count < 2}>
        Sign out every other device
      </SubmitButton>
    </form>
  );
}

export function DeleteAccountPanel() {
  const [state, action] = useActionState<FormState, FormData>(deleteAccountAction, {});
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <div className="p-4">
        <Button type="button" variant="danger" size="sm" onClick={() => setOpen(true)}>
          Delete my account
        </Button>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3 p-4" noValidate>
      <Alert tone="danger" title="This permanently deletes everything">
        Your records, balance history, refund cases, reminders, uploaded files and settings are removed
        from the database and from disk. It is not a soft delete and there is no undo. Export your data
        first if you want a copy.
      </Alert>
      <FormMessage state={state} />
      <Field label="Your password" name="password" required error={state.errors?.password}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="Type: delete my account" name="confirm" required error={state.errors?.confirm}>
        <Input id="confirm" name="confirm" placeholder="delete my account" autoComplete="off" required />
      </Field>
      <div className="flex gap-2">
        <SubmitButton variant="danger" size="sm" pendingLabel="Deleting…">
          Permanently delete my account
        </SubmitButton>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function PlanOverridePanel({ current }: { current: string }) {
  const [state, action] = useActionState<FormState, FormData>(setPlanAction, {});
  return (
    <form action={action} className="space-y-3 p-4" noValidate>
      <Alert tone="warning" title="Development build only">
        No payment provider exists. This switch changes the entitlement record directly so plan limits can
        be exercised in testing. It is unavailable in a production build.
      </Alert>
      <FormMessage state={state} />
      <Field label="Plan" name="plan">
        <Select id="plan" name="plan" defaultValue={current}>
          <option value="free">Free</option>
          <option value="plus">ValueBack Plus</option>
          <option value="family">ValueBack Family</option>
        </Select>
      </Field>
      <SubmitButton variant="secondary" size="sm" pendingLabel="Applying…">
        Apply plan override
      </SubmitButton>
    </form>
  );
}

export function ImportPanel() {
  const [state, action] = useActionState<FormState, FormData>(importBenefitsAction, {});
  const report = state.payload?.report as
    | { created: number; skippedDuplicates: Array<{ title: string; signals: string[] }>; errors: Array<{ index: number; title: string; problem: string }> }
    | undefined;

  return (
    <form action={action} className="space-y-4 p-4 sm:p-5" noValidate>
      <FormMessage state={state} />
      <Field
        label="ValueBack JSON export"
        name="file"
        required
        error={state.errors?.file}
        hint="Benefits are imported. Refund cases, documents and history are not — they reference files and events that cannot be recreated safely."
      >
        <input
          id="file"
          name="file"
          type="file"
          accept="application/json,.json"
          required
          className="vb-input file:mr-3 file:rounded-md file:border-0 file:bg-[var(--accent-soft)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[var(--accent-soft-text)]"
        />
      </Field>
      <Field label="If a record looks like a duplicate" name="onDuplicate">
        <Select id="onDuplicate" name="onDuplicate" defaultValue="skip">
          <option value="skip">Skip it and tell me</option>
          <option value="import">Import it anyway</option>
        </Select>
      </Field>
      <SubmitButton variant="secondary" pendingLabel="Importing…">
        Import benefits
      </SubmitButton>

      {report ? (
        <div className="space-y-2 rounded-lg border border-[var(--border)] p-3 text-[0.8125rem]">
          <p className="font-semibold">Import report</p>
          <p className="text-[var(--text-muted)]">{report.created} records created.</p>
          {report.skippedDuplicates.length > 0 ? (
            <div>
              <p className="font-medium">Skipped as duplicates</p>
              <ul className="mt-1 space-y-0.5 text-[var(--text-muted)]">
                {report.skippedDuplicates.map((s, i) => (
                  <li key={`${s.title}-${i}`}>
                    {s.title} — matched on {s.signals.join(', ')}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {report.errors.length > 0 ? (
            <div>
              <p className="font-medium text-[var(--danger)]">Rejected</p>
              <ul className="mt-1 space-y-0.5 text-[var(--text-muted)]">
                {report.errors.map((e, i) => (
                  <li key={`${e.index}-${i}`}>
                    Row {e.index + 1} {e.title ? `(${e.title})` : ''}: {e.problem}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

export function ExportCodesForm() {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <form method="post" action="/api/export" className="space-y-3">
      <input type="hidden" name="kind" value="archive" />
      <input type="hidden" name="includeCodes" value="on" />
      <Alert tone="warning" title="This export contains your redemption codes in plain text">
        Anyone who opens the archive can spend those gift cards and vouchers. Keep it encrypted and
        delete it when you are done.
      </Alert>
      <Checkbox
        name="understood"
        checked={confirmed}
        onChange={(e) => setConfirmed(e.target.checked)}
        label="I understand this file contains usable codes"
      />
      <Field label="Confirm your password" name="password" required>
        <Input id="export-password" name="password" type="password" autoComplete="current-password" required disabled={!confirmed} />
      </Field>
      <SubmitButton variant="secondary" size="sm" disabled={!confirmed} pendingLabel="Preparing…">
        Download archive with codes
      </SubmitButton>
    </form>
  );
}
