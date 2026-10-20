'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { SUPPORTED_CURRENCIES } from '@/lib/money';
import { FormMessage, SubmitButton } from '@/components/form';
import { Card, CardHeader, Field, Input, Select, Textarea } from '@/components/ui';
import type { FormState } from '@/lib/validation';

export type RefundFormValues = {
  id?: string;
  merchant: string;
  orderRef: string;
  referenceNumber: string;
  currency: string;
  amount: string;
  purchaseDate: string;
  initiatedAt: string;
  expectedByDate: string;
  method: string;
  notes: string;
};

export function RefundForm({
  action,
  initial,
  mode,
  documentId,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  initial: RefundFormValues;
  mode: 'create' | 'edit';
  documentId?: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  return (
    <form action={formAction} className="space-y-5" noValidate>
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      {documentId ? <input type="hidden" name="documentId" value={documentId} /> : null}
      <FormMessage state={state} />

      <Card>
        <CardHeader title="Who owes you, and how much" />
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <Field label="Merchant" name="merchant" required error={state.errors?.merchant}>
            <Input
              id="merchant"
              name="merchant"
              defaultValue={initial.merchant}
              maxLength={80}
              required
              autoFocus
            />
          </Field>
          <Field
            label="Order reference"
            name="orderRef"
            error={state.errors?.orderRef}
            hint="The number on your order or invoice."
          >
            <Input id="orderRef" name="orderRef" defaultValue={initial.orderRef} maxLength={60} />
          </Field>
          <Field label="Currency" name="currency" error={state.errors?.currency}>
            <Select id="currency" name="currency" defaultValue={initial.currency}>
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Amount expected back" name="amount" required error={state.errors?.amount}>
            <Input
              id="amount"
              name="amount"
              inputMode="decimal"
              defaultValue={initial.amount}
              placeholder="3799.00"
              className="nums"
              required
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Dates and method"
          description="The expected date drives the follow-up reminder."
        />
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <Field label="Purchase date" name="purchaseDate" error={state.errors?.purchaseDate}>
            <Input
              id="purchaseDate"
              name="purchaseDate"
              type="date"
              defaultValue={initial.purchaseDate}
            />
          </Field>
          <Field
            label="Return or cancellation raised"
            name="initiatedAt"
            error={state.errors?.initiatedAt}
          >
            <Input
              id="initiatedAt"
              name="initiatedAt"
              type="date"
              defaultValue={initial.initiatedAt}
            />
          </Field>
          <Field
            label="Expected back by"
            name="expectedByDate"
            error={state.errors?.expectedByDate}
            hint="The window the merchant told you. A check-in reminder is set for the day after."
          >
            <Input
              id="expectedByDate"
              name="expectedByDate"
              type="date"
              defaultValue={initial.expectedByDate}
            />
          </Field>
          <Field
            label="Refund method"
            name="method"
            error={state.errors?.method}
            hint="Original payment method, bank transfer, store credit…"
          >
            <Input id="method" name="method" defaultValue={initial.method} maxLength={60} />
          </Field>
          <Field
            label="Refund reference number"
            name="referenceNumber"
            error={state.errors?.referenceNumber}
            className="sm:col-span-2"
          >
            <Input
              id="referenceNumber"
              name="referenceNumber"
              defaultValue={initial.referenceNumber}
              maxLength={60}
            />
          </Field>
          <Field label="Notes" name="notes" error={state.errors?.notes} className="sm:col-span-2">
            <Textarea
              id="notes"
              name="notes"
              defaultValue={initial.notes}
              rows={3}
              maxLength={2000}
            />
          </Field>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel="Saving…">
          {mode === 'create' ? 'Open this case' : 'Save changes'}
        </SubmitButton>
        <Link
          href={initial.id ? `/app/refunds/${initial.id}` : '/app/refunds'}
          className="text-sm text-[var(--text-muted)] hover:underline"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
