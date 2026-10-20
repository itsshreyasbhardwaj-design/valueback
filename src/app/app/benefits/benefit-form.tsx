'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { BENEFIT_CATEGORIES } from '@/lib/db/schema';
import { CATEGORY_LABELS } from '@/lib/format';
import { SUPPORTED_CURRENCIES } from '@/lib/money';
import { FormMessage, SubmitButton } from '@/components/form';
import { Alert, Card, CardHeader, Checkbox, Field, Input, Select, Textarea } from '@/components/ui';
import type { FormState } from '@/lib/validation';

export type BenefitFormValues = {
  id?: string;
  title: string;
  category: string;
  merchant: string;
  currency: string;
  originalValue: string;
  currentValue: string;
  unitLabel: string;
  units: string;
  issuedAt: string;
  receivedAt: string;
  expiresAt: string;
  conditions: string;
  notes: string;
  tags: string;
  codeHint?: string | null;
  recurrence: string;
  recurrenceUnits: string;
  recurrenceAnchor: string;
};

export function BenefitForm({
  action,
  initial,
  mode,
  reminderOffsets,
  documentId,
  evidence,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  initial: BenefitFormValues;
  mode: 'create' | 'edit';
  reminderOffsets: number[];
  documentId?: string;
  evidence?: 'user_entered' | 'document_extracted';
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [category, setCategory] = useState(initial.category);
  const [currency, setCurrency] = useState(initial.currency);
  const [recurrence, setRecurrence] = useState(initial.recurrence);
  const unitsLikely = ['prepaid_service', 'membership_credit', 'loyalty_reward'].includes(category);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      {documentId ? <input type="hidden" name="documentId" value={documentId} /> : null}
      {evidence ? <input type="hidden" name="evidence" value={evidence} /> : null}

      <FormMessage state={state} />

      <Card>
        <CardHeader title="What is it?" description="Only a name and a category are required." />
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <Field
            label="Name"
            name="title"
            required
            error={state.errors?.title}
            hint="Something you will recognise in a list, e.g. “Birthday gift card”."
            className="sm:col-span-2"
          >
            <Input id="title" name="title" defaultValue={initial.title} maxLength={120} required autoFocus />
          </Field>

          <Field label="Category" name="category" required error={state.errors?.category}>
            <Select id="category" name="category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {BENEFIT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Provider or merchant" name="merchant" error={state.errors?.merchant}>
            <Input id="merchant" name="merchant" defaultValue={initial.merchant} maxLength={80} list="merchant-hints" />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="What is it worth?"
          description="Leave the amount blank for things without one, like a free-dessert coupon."
        />
        <div className="grid gap-4 p-4 sm:grid-cols-3 sm:p-5">
          <Field label="Currency" name="currency" error={state.errors?.currency}>
            <Select id="currency" name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Original value"
            name="originalValue"
            error={state.errors?.originalValue}
            hint="Face value when issued."
          >
            <Input
              id="originalValue"
              name="originalValue"
              inputMode="decimal"
              defaultValue={initial.originalValue}
              placeholder="2500.00"
              className="nums"
            />
          </Field>

          <Field
            label="Remaining value"
            name="currentValue"
            error={state.errors?.currentValue}
            hint={mode === 'edit' ? 'Change this from the record page so the history stays intact.' : 'If some is already spent.'}
          >
            <Input
              id="currentValue"
              name="currentValue"
              inputMode="decimal"
              defaultValue={initial.currentValue}
              placeholder="2500.00"
              className="nums"
              disabled={mode === 'edit'}
            />
          </Field>

          <Field
            label={unitsLikely ? 'Units remaining' : 'Units remaining (non-monetary)'}
            name="units"
            error={state.errors?.units}
            hint="For example 10 classes."
          >
            <Input id="units" name="units" inputMode="numeric" defaultValue={initial.units} placeholder="10" className="nums" disabled={mode === 'edit'} />
          </Field>

          <Field label="What is a unit called?" name="unitLabel" error={state.errors?.unitLabel}>
            <Input id="unitLabel" name="unitLabel" defaultValue={initial.unitLabel} placeholder="classes" maxLength={30} />
          </Field>
        </div>
        {mode === 'edit' ? (
          <p className="border-t border-[var(--border)] px-4 py-2.5 text-xs text-[var(--text-faint)] sm:px-5">
            Balances are edited through the record page so every change keeps a reason and a date.
          </p>
        ) : null}
      </Card>

      <Card>
        <CardHeader title="Dates" description="An expiry date turns into reminders automatically." />
        <div className="grid gap-4 p-4 sm:grid-cols-3 sm:p-5">
          <Field label="Issued on" name="issuedAt" error={state.errors?.issuedAt}>
            <Input id="issuedAt" name="issuedAt" type="date" defaultValue={initial.issuedAt} />
          </Field>
          <Field label="Received on" name="receivedAt" error={state.errors?.receivedAt}>
            <Input id="receivedAt" name="receivedAt" type="date" defaultValue={initial.receivedAt} />
          </Field>
          <Field
            label="Expires on"
            name="expiresAt"
            error={state.errors?.expiresAt}
            hint={`Reminders at ${reminderOffsets.join(', ')} days before.`}
          >
            <Input id="expiresAt" name="expiresAt" type="date" defaultValue={initial.expiresAt} />
          </Field>
        </div>
      </Card>

      <details className="vb-card" open={Boolean(initial.codeHint || initial.conditions || initial.notes || initial.tags)}>
        <summary className="cursor-pointer px-4 py-3 text-[0.9375rem] font-semibold sm:px-5">
          Code, conditions and notes
        </summary>
        <div className="grid gap-4 border-t border-[var(--border)] p-4 sm:p-5">
          <Field
            label="Redemption code"
            name="code"
            error={state.errors?.code}
            hint="Stored encrypted and shown masked. It is never written to logs and never appears in search."
          >
            <Input
              id="code"
              name="code"
              maxLength={60}
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              placeholder={initial.codeHint ? `${initial.codeHint} — type a new code to replace it` : 'GC-1234-5678'}
            />
          </Field>
          {initial.codeHint ? <Checkbox name="clearCode" label="Remove the stored code" /> : null}

          <Field
            label="Conditions"
            name="conditions"
            error={state.errors?.conditions}
            hint="Minimum spend, excluded items, single use — whatever the small print says."
          >
            <Textarea id="conditions" name="conditions" defaultValue={initial.conditions} maxLength={2000} rows={3} />
          </Field>

          <Field label="Notes" name="notes" error={state.errors?.notes}>
            <Textarea id="notes" name="notes" defaultValue={initial.notes} maxLength={2000} rows={3} />
          </Field>

          <Field label="Tags" name="tags" error={state.errors?.tags} hint="Comma separated, for example: travel, gift, work.">
            <Input id="tags" name="tags" defaultValue={initial.tags} maxLength={200} />
          </Field>
        </div>
      </details>

      <details className="vb-card" open={initial.recurrence !== 'none'}>
        <summary className="cursor-pointer px-4 py-3 text-[0.9375rem] font-semibold sm:px-5">
          Recurring allowance
        </summary>
        <div className="grid gap-4 border-t border-[var(--border)] p-4 sm:grid-cols-3 sm:p-5">
          <Field label="Repeats" name="recurrence">
            <Select id="recurrence" name="recurrence" value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
              <option value="none">Does not repeat</option>
              <option value="monthly">Every month</option>
              <option value="quarterly">Every quarter</option>
              <option value="yearly">Every year</option>
            </Select>
          </Field>
          <Field label="Units added each period" name="recurrenceUnits" error={state.errors?.recurrenceUnits}>
            <Input
              id="recurrenceUnits"
              name="recurrenceUnits"
              inputMode="numeric"
              defaultValue={initial.recurrenceUnits}
              disabled={recurrence === 'none'}
              className="nums"
            />
          </Field>
          <Field label="Starting from" name="recurrenceAnchor">
            <Input
              id="recurrenceAnchor"
              name="recurrenceAnchor"
              type="date"
              defaultValue={initial.recurrenceAnchor}
              disabled={recurrence === 'none'}
            />
          </Field>
        </div>
        {recurrence !== 'none' ? (
          <Alert tone="neutral" className="mx-4 mb-4 sm:mx-5">
            Each new period tops the balance up once. Running the app twice in the same month does not add
            it twice.
          </Alert>
        ) : null}
      </details>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel="Saving…">{mode === 'create' ? 'Save benefit' : 'Save changes'}</SubmitButton>
        <Link
          href={initial.id ? `/app/benefits/${initial.id}` : '/app/benefits'}
          className="text-sm text-[var(--text-muted)] hover:underline"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
