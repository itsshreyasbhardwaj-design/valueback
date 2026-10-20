import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/* --------------------------------------------------------------- button */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-55 disabled:cursor-not-allowed whitespace-nowrap';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-[var(--accent)] text-[var(--accent-contrast)] hover:opacity-90',
  secondary: 'bg-[var(--surface)] text-[var(--text)] border border-[var(--border-strong)] hover:bg-[var(--bg-subtle)]',
  ghost: 'text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]',
  danger: 'bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger)]/30 hover:opacity-90',
};

const SIZES: Record<Size, string> = {
  sm: 'text-[0.8125rem] px-2.5 py-1.5 min-h-[2rem]',
  md: 'text-sm px-4 py-2 min-h-[2.5rem]',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ComponentProps<'button'> & { variant?: Variant; size?: Size }) {
  return <button className={cn(BUTTON_BASE, VARIANTS[variant], SIZES[size], className)} {...props} />;
}

export function LinkButton({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={cn(BUTTON_BASE, VARIANTS[variant], SIZES[size], className)} {...props} />;
}

/* ---------------------------------------------------------------- cards */

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('vb-card', className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  as: As = 'h2',
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  as?: 'h1' | 'h2' | 'h3';
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <As className="text-[0.9375rem] font-semibold">{title}</As>
        {description ? <p className="mt-0.5 text-[0.8125rem] text-[var(--text-muted)]">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* --------------------------------------------------------------- badges */

export type Tone = 'neutral' | 'positive' | 'warning' | 'danger' | 'info';

const TONES: Record<Tone, string> = {
  neutral: 'bg-[var(--bg-subtle)] text-[var(--text-muted)] border-[var(--border-strong)]',
  positive: 'bg-[var(--accent-soft)] text-[var(--accent-soft-text)] border-transparent',
  warning: 'bg-[var(--warn-soft)] text-[var(--warn)] border-transparent',
  danger: 'bg-[var(--danger-soft)] text-[var(--danger)] border-transparent',
  info: 'bg-[var(--info-soft)] text-[var(--info-text)] border-transparent',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
  title,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold tracking-wide',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- forms */

export function Field({
  label,
  name,
  hint,
  error,
  children,
  required,
  className,
}: {
  label: string;
  name: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  required?: boolean;
  className?: string;
}) {
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = error ? `${name}-error` : undefined;
  return (
    <div className={className}>
      <label className="vb-label" htmlFor={name}>
        {label}
        {required ? <span className="text-[var(--danger)]"> *</span> : <span className="font-normal text-[var(--text-faint)]"> (optional)</span>}
      </label>
      {children}
      {hint ? (
        <p id={hintId} className="mt-1 text-xs text-[var(--text-faint)]">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-xs font-medium text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn('vb-input', className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select className={cn('vb-input', className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn('vb-input min-h-[5rem] py-2', className)} {...props} />;
}

export function Checkbox({ label, hint, ...props }: ComponentProps<'input'> & { label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 py-1">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
        {...props}
      />
      <span>
        <span className="text-sm">{label}</span>
        {hint ? <span className="block text-xs text-[var(--text-faint)]">{hint}</span> : null}
      </span>
    </label>
  );
}

/* --------------------------------------------------------------- alerts */

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const border: Record<Tone, string> = {
    neutral: 'border-[var(--border-strong)]',
    positive: 'border-[var(--accent)]/40',
    warning: 'border-[var(--warn)]/40',
    danger: 'border-[var(--danger)]/40',
    info: 'border-[var(--border-strong)]',
  };
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('rounded-lg border px-3.5 py-3 text-sm', TONES[tone], border[tone], className)}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={cn(title ? 'mt-1' : undefined, 'text-[0.8125rem] leading-relaxed')}>{children}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon ? <div className="mb-3 text-[var(--text-faint)]">{icon}</div> : null}
      <p className="text-[0.9375rem] font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-[var(--text-muted)]">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Inline definition marker — every metric in ValueBack carries its meaning. */
export function Explain({ children }: { children: string }) {
  return (
    <span
      tabIndex={0}
      role="note"
      aria-label={children}
      title={children}
      className="ml-1 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-[var(--border-strong)] text-[0.625rem] font-bold text-[var(--text-faint)] align-middle"
    >
      ?
    </span>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn('border-t border-[var(--border)]', className)} />;
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">{description}</p> : null}
      </div>
      {action ? <div className="flex gap-2">{action}</div> : null}
    </header>
  );
}
