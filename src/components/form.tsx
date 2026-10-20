'use client';

import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { Button } from './ui';
import type { ComponentProps } from 'react';

/** Submit button that shows progress for the form it sits in. */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending} {...props}>
      {pending ? <Loader2 size={15} className="animate-spin" aria-hidden /> : null}
      {pending ? (pendingLabel ?? 'Working…') : children}
    </Button>
  );
}

/** Announces the result of a submitted form to everyone, including screen readers. */
export function FormMessage({ state }: { state: { ok?: boolean; message?: string; errors?: Record<string, string> } }) {
  const formError = state.errors?._form;
  const message = formError ?? state.message;
  if (!message) return null;
  const bad = Boolean(formError) || state.ok === false;
  return (
    <p
      role={bad ? 'alert' : 'status'}
      aria-live="polite"
      className={`rounded-lg border px-3 py-2 text-sm ${
        bad
          ? 'border-[var(--danger)]/40 bg-[var(--danger-soft)] text-[var(--danger)]'
          : 'border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent-soft-text)]'
      }`}
    >
      {message}
    </p>
  );
}
