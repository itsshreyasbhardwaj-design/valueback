'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { recoverAction } from '../actions';
import { FormMessage, SubmitButton } from '@/components/form';
import { Alert, Card, Field, Input } from '@/components/ui';
import type { FormState } from '@/lib/validation';

export function RecoverForm() {
  const [state, action] = useActionState<FormState, FormData>(recoverAction, {});
  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">Recover your account</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Use one of the recovery codes you generated and saved. Each code works once.
      </p>

      <form action={action} className="mt-5 space-y-4" noValidate>
        <FormMessage state={state} />
        <Field label="Email address" name="email" required>
          <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
        </Field>
        <Field
          label="Recovery code"
          name="code"
          required
          hint="Formatted like ABCD-EFGH-JKLM. Case does not matter."
        >
          <Input
            id="code"
            name="code"
            required
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
          />
        </Field>
        <Field label="New password" name="newPassword" required error={state.errors?.newPassword}>
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
          />
        </Field>
        <Field
          label="Confirm new password"
          name="confirmPassword"
          required
          error={state.errors?.confirmPassword}
        >
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
          />
        </Field>
        <SubmitButton className="w-full" pendingLabel="Checking…">
          Set a new password
        </SubmitButton>
      </form>

      <Alert tone="neutral" className="mt-5">
        No recovery code? There is no other way back in. Account data is held only by this
        installation, and no email provider is connected, so nobody can verify your identity another
        way.
      </Alert>

      <p className="mt-4 text-sm text-[var(--text-muted)]">
        <Link href="/signin" className="underline">
          Back to sign in
        </Link>
      </p>
    </Card>
  );
}
