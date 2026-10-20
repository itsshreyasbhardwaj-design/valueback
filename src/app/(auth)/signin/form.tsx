'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { signInAction } from '../actions';
import { FormMessage, SubmitButton } from '@/components/form';
import { Card, Field, Input } from '@/components/ui';
import type { FormState } from '@/lib/validation';

export function SignInForm() {
  const [state, action] = useActionState<FormState, FormData>(signInAction, {});
  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">Sign in to ValueBack</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">Pick up where you left off.</p>

      <form action={action} className="mt-5 space-y-4" noValidate>
        <FormMessage state={state} />
        <Field label="Email address" name="email" required error={state.errors?.email}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            aria-invalid={Boolean(state.errors?.email)}
          />
        </Field>
        <Field label="Password" name="password" required error={state.errors?.password}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={Boolean(state.errors?.password)}
          />
        </Field>
        <SubmitButton className="w-full" pendingLabel="Signing in…">
          Sign in
        </SubmitButton>
      </form>

      <p className="mt-5 text-sm text-[var(--text-muted)]">
        No account yet?{' '}
        <Link href="/signup" className="font-medium text-[var(--accent)] underline">
          Create one
        </Link>
      </p>
      <p className="mt-2 text-xs text-[var(--text-faint)]">
        Forgotten your password? There is no reset email in this build.{' '}
        <Link href="/recover" className="underline">
          Use a recovery code
        </Link>{' '}
        if you saved one.
      </p>
    </Card>
  );
}
