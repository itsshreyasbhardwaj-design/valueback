'use client';

import { useActionState } from 'react';
import { BENEFIT_CATEGORIES } from '@/lib/db/schema';
import { CATEGORY_LABELS } from '@/lib/format';
import { SUPPORTED_CURRENCIES } from '@/lib/money';
import { FormMessage, SubmitButton } from '@/components/form';
import { Field, Input, Select } from '@/components/ui';
import type { FormState } from '@/lib/validation';
import { goToStepAction, quickAddBenefitAction, saveInterestsAction } from './actions';

export function StepButton({
  step,
  children,
  variant = 'primary',
}: {
  step: number;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
}) {
  const [, action] = useActionState<FormState, FormData>(goToStepAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="step" value={step} />
      <SubmitButton variant={variant} pendingLabel="…">
        {children}
      </SubmitButton>
    </form>
  );
}

export function InterestsForm({ selected }: { selected: string[] }) {
  const [state, action] = useActionState<FormState, FormData>(saveInterestsAction, {});
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <fieldset>
        <legend className="vb-label">Tick anything that applies</legend>
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          {BENEFIT_CATEGORIES.filter((c) => c !== 'other').map((c) => (
            <label
              key={c}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-[var(--border)] px-3 py-2.5 text-sm hover:bg-[var(--bg-subtle)]"
            >
              <input
                type="checkbox"
                name="interests"
                value={c}
                defaultChecked={selected.includes(c)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              {CATEGORY_LABELS[c]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingLabel="Saving…">Continue</SubmitButton>
        <StepButton step={3} variant="ghost">
          Skip this
        </StepButton>
      </div>
    </form>
  );
}

export function QuickAddForm({
  currency,
  suggestedCategory,
}: {
  currency: string;
  suggestedCategory: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(quickAddBenefitAction, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="What is it?"
          name="title"
          required
          error={state.errors?.title}
          className="sm:col-span-2"
        >
          <Input
            id="title"
            name="title"
            maxLength={120}
            required
            placeholder="Gift card from Diwali"
            autoFocus
          />
        </Field>
        <Field label="Category" name="category">
          <Select id="category" name="category" defaultValue={suggestedCategory}>
            {BENEFIT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Merchant" name="merchant">
          <Input
            id="merchant"
            name="merchant"
            maxLength={80}
            placeholder="Where you can spend it"
          />
        </Field>
        <Field label="Currency" name="currency">
          <Select id="currency" name="currency" defaultValue={currency}>
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Value"
          name="originalValue"
          error={state.errors?.originalValue}
          hint="Leave blank if it does not have one."
        >
          <Input
            id="originalValue"
            name="originalValue"
            inputMode="decimal"
            className="nums"
            placeholder="2500.00"
          />
        </Field>
        <Field
          label="Expires on"
          name="expiresAt"
          error={state.errors?.expiresAt}
          hint="This is what reminders are built from."
          className="sm:col-span-2"
        >
          <Input id="expiresAt" name="expiresAt" type="date" />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingLabel="Saving…">Save it and continue</SubmitButton>
        <StepButton step={4} variant="ghost">
          I will add one later
        </StepButton>
      </div>
    </form>
  );
}
