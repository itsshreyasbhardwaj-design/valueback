'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { signUpAction } from '../actions';
import { FormMessage, SubmitButton } from '@/components/form';
import { Alert, Card, Field, Input } from '@/components/ui';
import type { FormState } from '@/lib/validation';

export function SignUpForm() {
  const [state, action] = useActionState<FormState, FormData>(signUpAction, {});
  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">Create your ValueBack account</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Free, and there is no payment system in this build to upgrade you into.
      </p>

      <form action={action} className="mt-5 space-y-4" noValidate>
        <FormMessage state={state} />
        <Field label="Your name" name="name" hint="Used to sign the follow-up messages you send." error={state.errors?.name}>
          <Input id="name" name="name" autoComplete="name" maxLength={80} />
        </Field>
        <Field label="Email address" name="email" required hint="Used as your sign-in name. No mail is ever sent to it." error={state.errors?.email}>
          <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={Boolean(state.errors?.email)} />
        </Field>
        <Field
          label="Password"
          name="password"
          required
          hint="At least 10 characters. A passphrase of a few words is easier to remember and harder to guess."
          error={state.errors?.password}
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
            aria-invalid={Boolean(state.errors?.password)}
          />
        </Field>

        <Alert tone="warning" title="There is no password-reset email">
          No email provider is connected, so nobody can send you a reset link. Straight after signing up,
          generate recovery codes in Settings and keep them somewhere safe.
        </Alert>

        <SubmitButton className="w-full" pendingLabel="Creating your account…">
          Create account
        </SubmitButton>
      </form>

      <p className="mt-5 text-sm text-[var(--text-muted)]">
        Already have an account?{' '}
        <Link href="/signin" className="font-medium text-[var(--accent)] underline">
          Sign in
        </Link>
      </p>
      <p className="mt-3 text-xs text-[var(--text-faint)]">
        By creating an account you accept the draft{' '}
        <Link href="/terms" className="underline">
          terms
        </Link>{' '}
        and{' '}
        <Link href="/privacy" className="underline">
          privacy policy
        </Link>
        .
      </p>
    </Card>
  );
}
