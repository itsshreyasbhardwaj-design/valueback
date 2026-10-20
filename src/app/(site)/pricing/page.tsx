import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, Minus } from 'lucide-react';
import { Alert, Card, LinkButton } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Provisional ValueBack plans. No payment system exists in this build — every account is on the free plan.',
};

const PLANS = [
  {
    name: 'Free',
    price: '₹0',
    cadence: 'forever',
    summary: 'Enough to actually use, not a trial.',
    featured: false,
    features: [
      'Up to 25 active records',
      '20 document uploads a month',
      'Refund case tracking with the full timeline',
      'Expiry and follow-up reminders',
      'Analytics, search and filtering',
      'CSV, JSON and document exports',
      'One household space',
    ],
    missing: ['Higher limits', 'Priority on larger document batches'],
  },
  {
    name: 'ValueBack Plus',
    price: '₹149',
    cadence: 'per month',
    summary: 'For people juggling a lot of open claims.',
    featured: true,
    features: [
      'Up to 500 active records',
      '300 document uploads a month',
      'Everything in Free',
      'Saved filter views',
      'Longer recovery history in analytics',
    ],
    missing: ['Extra household spaces'],
  },
  {
    name: 'ValueBack Family',
    price: '₹249',
    cadence: 'per month',
    summary: 'For a household chasing things together.',
    featured: false,
    features: [
      'Everything in Plus',
      'Up to 3 household spaces',
      'Up to 8 members per household',
      'Per-record sharing with view or edit permission',
      'Follow-up assignments between members',
    ],
    missing: [],
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold">Pricing</h1>
      <p className="mt-3 max-w-2xl text-[var(--text-muted)]">
        These plans are provisional and the prices are not final.
      </p>

      <Alert tone="info" title="There is no checkout in this build" className="mt-6 max-w-3xl">
        No payment provider is connected, nothing can be bought, and no account has ever been charged.
        Every account runs on the Free plan. The plan limits below are real and enforced in code — they
        are simply all set to Free until billing exists.
      </Alert>

      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        {PLANS.map((p) => (
          <Card
            key={p.name}
            className={`flex flex-col p-5 ${p.featured ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]/30' : ''}`}
          >
            {p.featured ? (
              <span className="mb-2 inline-flex w-fit rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-[0.6875rem] font-semibold text-[var(--accent-soft-text)]">
                Most capacity for the price
              </span>
            ) : null}
            <h2 className="text-lg font-semibold">{p.name}</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{p.summary}</p>
            <p className="mt-4">
              <span className="nums text-3xl font-semibold">{p.price}</span>{' '}
              <span className="text-sm text-[var(--text-muted)]">{p.cadence}</span>
            </p>
            <ul className="mt-5 flex-1 space-y-2 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <Check size={16} className="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden />
                  <span>{f}</span>
                </li>
              ))}
              {p.missing.map((f) => (
                <li key={f} className="flex gap-2 text-[var(--text-faint)]">
                  <Minus size={16} className="mt-0.5 shrink-0" aria-hidden />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6">
              {p.name === 'Free' ? (
                <LinkButton href="/signup" className="w-full">
                  Start tracking for free
                </LinkButton>
              ) : (
                <button
                  type="button"
                  disabled
                  title="No payment provider is connected in this build."
                  className="w-full cursor-not-allowed rounded-lg border border-[var(--border-strong)] px-4 py-2 text-sm font-medium text-[var(--text-faint)]"
                >
                  Not available yet
                </button>
              )}
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-10 grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-lg font-semibold">What happens when billing is added</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Plan entitlements already exist as a real part of the data model: each account has a plan,
            and limits are checked on the server before a record is created. Adding a payment provider
            means writing the plan on a successful payment — no feature flags need inventing.
          </p>
        </Card>
        <Card className="p-5">
          <h2 className="text-lg font-semibold">Note on household sharing</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Household sharing is listed under Family. Because no plan can be purchased, the Free plan
            includes one household space so the feature is genuinely usable rather than a locked button.
            This is a deliberate choice for the current build and is recorded in the project documentation.
          </p>
        </Card>
      </div>

      <p className="mt-8 text-sm text-[var(--text-muted)]">
        Questions about a plan?{' '}
        <Link href="/contact" className="underline">
          Get in touch
        </Link>
        .
      </p>
    </div>
  );
}
