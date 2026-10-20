import type { Metadata } from 'next';
import Link from 'next/link';
import {
  BellRing,
  CheckCircle2,
  LayoutDashboard,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { parseOffsets } from '@/lib/reminders';
import { Card, LinkButton } from '@/components/ui';
import { SubmitButton } from '@/components/form';
import { finishOnboardingAction, skipOnboardingAction } from './actions';
import { InterestsForm, QuickAddForm, StepButton } from './panels';

export const metadata: Metadata = { title: 'Getting started' };

const STEPS = ['Welcome', 'Why it helps', 'What you track', 'Add one', 'Reminders', 'Done'];

export default async function OnboardingPage() {
  const user = await requireUser();
  const step = Math.min(5, Math.max(0, user.settings.onboardingStep));
  const offsets = parseOffsets(user.settings.reminderOffsets);
  let interests: string[] = [];
  try {
    const parsed: unknown = JSON.parse(user.settings.onboardingInterests);
    if (Array.isArray(parsed)) interests = parsed.map(String);
  } catch {
    interests = [];
  }

  return (
    <div className="mx-auto max-w-2xl">
      <nav aria-label="Progress" className="mb-6">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-center gap-2">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[0.625rem] font-bold ${
                  i < step
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                    : i === step
                      ? 'border-2 border-[var(--accent)] text-[var(--accent)]'
                      : 'border border-[var(--border-strong)] text-[var(--text-faint)]'
                }`}
                aria-hidden
              >
                {i < step ? '✓' : i + 1}
              </span>
              <span className={i === step ? 'font-semibold' : 'text-[var(--text-faint)]'}>
                {label}
              </span>
              {i < STEPS.length - 1 ? (
                <span className="text-[var(--text-faint)]" aria-hidden>
                  ·
                </span>
              ) : null}
            </li>
          ))}
        </ol>
        <p className="sr-only">
          Step {step + 1} of {STEPS.length}
        </p>
      </nav>

      <Card className="p-6">
        {step === 0 ? (
          <>
            <Sparkles size={22} className="text-[var(--accent)]" aria-hidden />
            <h1 className="mt-3 text-2xl font-semibold">
              Welcome to ValueBack{user.name ? `, ${user.name.split(' ')[0]}` : ''}
            </h1>
            <p className="mt-3 text-[var(--text-muted)]">
              This takes about a minute. By the end you will have one real record being watched, and
              you will know what the app does and does not do.
            </p>
            <p className="mt-3 text-sm text-[var(--text-muted)]">
              Everything is stored on the machine running this app. There is no bank connection and
              no merchant integration — ValueBack organises what you tell it.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <StepButton step={1}>Let&rsquo;s go</StepButton>
              <form action={skipOnboardingAction}>
                <SubmitButton variant="ghost" pendingLabel="…">
                  Skip the setup
                </SubmitButton>
              </form>
            </div>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Wallet size={22} className="text-[var(--accent)]" aria-hidden />
            <h1 className="mt-3 text-2xl font-semibold">Small amounts, scattered everywhere</h1>
            <p className="mt-3 text-[var(--text-muted)]">
              A ₹500 gift card in a drawer. A refund the shop said would take 7 to 10 days. Four
              unused classes in a pack of ten. None of it is big enough to chase on its own, which
              is exactly why it gets lost.
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              <li className="flex gap-2.5">
                <CheckCircle2
                  size={16}
                  className="mt-0.5 shrink-0 text-[var(--accent)]"
                  aria-hidden
                />
                <span>One list, with the deadline attached to every item.</span>
              </li>
              <li className="flex gap-2.5">
                <CheckCircle2
                  size={16}
                  className="mt-0.5 shrink-0 text-[var(--accent)]"
                  aria-hidden
                />
                <span>Reminders before a date passes, not after.</span>
              </li>
              <li className="flex gap-2.5">
                <CheckCircle2
                  size={16}
                  className="mt-0.5 shrink-0 text-[var(--accent)]"
                  aria-hidden
                />
                <span>A clear split between what you might get and what you actually got.</span>
              </li>
            </ul>
            <div className="mt-6 flex flex-wrap gap-2">
              <StepButton step={2}>Next</StepButton>
              <StepButton step={0} variant="ghost">
                Back
              </StepButton>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <h1 className="text-2xl font-semibold">What would you like to track?</h1>
            <p className="mt-2 text-[var(--text-muted)]">
              This only tailors a few suggestions. You can track anything at any time regardless.
            </p>
            <div className="mt-5">
              <InterestsForm selected={interests} />
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <h1 className="text-2xl font-semibold">Add the one you nearly forgot</h1>
            <p className="mt-2 text-[var(--text-muted)]">
              Only a name is required. An expiry date is what turns it into reminders.
            </p>
            <div className="mt-5">
              <QuickAddForm
                currency={user.settings.currency}
                suggestedCategory={interests[0] ?? 'gift_card'}
              />
            </div>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <BellRing size={22} className="text-[var(--accent)]" aria-hidden />
            <h1 className="mt-3 text-2xl font-semibold">How reminders work</h1>
            <p className="mt-3 text-[var(--text-muted)]">
              Give a record an expiry date and ValueBack schedules reminders{' '}
              <strong className="text-[var(--text)]">{offsets.join(', ')} days before</strong>. A
              refund case gets a check-in after the window you recorded. You can snooze, move or
              cancel any of them.
            </p>
            <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-sm">
              <p className="flex items-center gap-2 font-semibold">
                <ShieldCheck size={15} className="text-[var(--accent)]" aria-hidden /> Being
                straight with you
              </p>
              <p className="mt-1.5 text-[var(--text-muted)]">
                Reminders appear while ValueBack is running, or when the scheduler command is run.
                Nothing is pushed to your phone and no email is sent, because this build has no push
                service and no email provider.
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <StepButton step={5}>Next</StepButton>
              <StepButton step={3} variant="ghost">
                Back
              </StepButton>
            </div>
          </>
        ) : null}

        {step === 5 ? (
          <>
            <LayoutDashboard size={22} className="text-[var(--accent)]" aria-hidden />
            <h1 className="mt-3 text-2xl font-semibold">Your dashboard</h1>
            <p className="mt-3 text-[var(--text-muted)]">
              The dashboard keeps four numbers apart on purpose: what you reported, what you
              verified, what is still pending, and what you actually recovered. Hover the ? beside
              any of them to see exactly what it counts.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-[var(--text-muted)]">
              <li>
                • <strong className="text-[var(--text)]">Needs attention</strong> ranks items and
                explains why in plain language.
              </li>
              <li>
                • <strong className="text-[var(--text)]">Upload a receipt</strong> to have values
                read on this machine and proposed for your approval.
              </li>
              <li>
                • <strong className="text-[var(--text)]">Nothing counts as recovered</strong> until
                you say it happened.
              </li>
            </ul>
            <div className="mt-6 flex flex-wrap gap-2">
              <form action={finishOnboardingAction}>
                <SubmitButton pendingLabel="…">Go to my dashboard</SubmitButton>
              </form>
              <LinkButton href="/app/benefits/new" variant="secondary">
                Add another record
              </LinkButton>
            </div>
          </>
        ) : null}
      </Card>

      {step < 5 ? (
        <p className="mt-4 text-center text-sm text-[var(--text-muted)]">
          <Link href="/app" className="underline">
            Skip to the dashboard
          </Link>{' '}
          — your progress is saved, so you can come back.
        </p>
      ) : null}
    </div>
  );
}
