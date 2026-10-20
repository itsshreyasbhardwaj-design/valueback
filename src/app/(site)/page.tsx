import Link from 'next/link';
import {
  ArrowRight, BellRing, CheckCircle2, CreditCard, FileSearch, Gift, Landmark, Lock,
  Plane, ReceiptText, RotateCcw, Ticket, Sparkles, Wallet,
} from 'lucide-react';
import { ProductPreview } from '@/components/product-preview';
import { Card, LinkButton } from '@/components/ui';

const TRACKS = [
  { icon: Gift, label: 'Gift cards', note: 'Balance, expiry and the code, stored encrypted.' },
  { icon: ReceiptText, label: 'Store credits', note: 'Credit notes and wallet balances after a return.' },
  { icon: RotateCcw, label: 'Pending refunds', note: 'From the day you raise it to the day it lands.' },
  { icon: CreditCard, label: 'Cashback', note: 'Amounts promised but not yet credited.' },
  { icon: Ticket, label: 'Coupons', note: 'With the conditions that actually apply.' },
  { icon: Wallet, label: 'Prepaid packs', note: 'Classes, sessions and visits you already paid for.' },
  { icon: Landmark, label: 'Memberships', note: 'Credits that come with a plan you are paying for.' },
  { icon: Plane, label: 'Travel vouchers', note: 'Airline and hotel credit from a cancelled trip.' },
];

const STEPS = [
  { n: '01', title: 'Capture', body: 'Type it in, or upload the receipt, email or PDF. Text is read on your machine and turned into suggestions.' },
  { n: '02', title: 'Verify', body: 'You confirm or correct every value before it is saved. Nothing a parser guessed is treated as fact.' },
  { n: '03', title: 'Track', body: 'Balances change through a ledger. Each entry records what changed, when and why.' },
  { n: '04', title: 'Remind', body: 'Expiry and follow-up dates become reminders at 30, 14, 7, 3 and 1 days, or your own schedule.' },
  { n: '05', title: 'Act', body: 'Use the credit, or send the merchant a follow-up drafted from the facts on your case.' },
  { n: '06', title: 'Confirm', body: 'You mark what you actually received. Only confirmed outcomes count as recovered.' },
];

export default function HomePage() {
  return (
    <>
      <section className="border-b border-[var(--border)]">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:py-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] px-3 py-1 text-xs font-medium text-[var(--text-muted)]">
              <Sparkles size={13} aria-hidden /> Don’t lose value you’ve already paid for
            </p>
            <h1 className="mt-4 text-3xl font-semibold leading-[1.1] sm:text-4xl lg:text-5xl">
              Stop losing track of money that’s already yours.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-[var(--text-muted)] sm:text-lg">
              Track refunds, gift cards, store credits and prepaid benefits in one place. Know what needs
              your attention and take action before opportunities pass.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <LinkButton href="/signup">
                Start tracking for free <ArrowRight size={16} aria-hidden />
              </LinkButton>
              <LinkButton href="/how-it-works" variant="secondary">
                See how it works
              </LinkButton>
            </div>
            <ul className="mt-7 grid gap-2 text-sm text-[var(--text-muted)] sm:grid-cols-2">
              <li className="flex items-start gap-2">
                <Lock size={15} className="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden />
                Runs on your own machine. No bank login, no card details.
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden />
                Nothing counts as recovered until you confirm it.
              </li>
              <li className="flex items-start gap-2">
                <FileSearch size={15} className="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden />
                Receipts are read locally — no document leaves the device.
              </li>
              <li className="flex items-start gap-2">
                <BellRing size={15} className="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden />
                Deadline reminders you can snooze, reschedule or switch off.
              </li>
            </ul>
          </div>
          <ProductPreview />
        </div>
      </section>

      <section className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-semibold">What you can keep track of</h2>
          <p className="mt-2 max-w-2xl text-[var(--text-muted)]">
            Small amounts scattered across merchants are easy to forget. ValueBack puts them in one list,
            with the deadline attached to each one.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TRACKS.map((t) => {
              const Icon = t.icon;
              return (
                <div key={t.label} className="rounded-xl border border-[var(--border)] p-4">
                  <Icon size={18} className="text-[var(--accent)]" aria-hidden />
                  <p className="mt-2.5 font-semibold">{t.label}</p>
                  <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-muted)]">{t.note}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-b border-[var(--border)]">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-semibold">Capture, verify, track, remind, act, confirm</h2>
          <p className="mt-2 max-w-2xl text-[var(--text-muted)]">
            The same six steps run through every part of the product.
          </p>
          <ol className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
                <span className="nums text-xs font-bold tracking-widest text-[var(--accent)]">{s.n}</span>
                <h3 className="mt-2 text-base font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold">Numbers you can actually trust</h2>
            <p className="mt-3 text-[var(--text-muted)]">
              A tracker is worthless if its totals flatter you. ValueBack keeps uncertain, pending and
              confirmed amounts apart, and shows what each figure means.
            </p>
            <ul className="mt-5 space-y-3 text-sm">
              <li className="flex gap-3">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden />
                <span>
                  <strong className="font-semibold">No single misleading total.</strong> What you reported, what
                  you verified, what is still pending and what you actually recovered are four separate figures.
                </span>
              </li>
              <li className="flex gap-3">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden />
                <span>
                  <strong className="font-semibold">No double counting.</strong> Spend ₹400 of a ₹1,000 credit and
                  you have ₹600 available and ₹400 recovered — never ₹1,600 of anything.
                </span>
              </li>
              <li className="flex gap-3">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden />
                <span>
                  <strong className="font-semibold">No invented confidence.</strong> Each record says where its
                  number came from: typed by you, read from a document, or checked with the provider.
                </span>
              </li>
              <li className="flex gap-3">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden />
                <span>
                  <strong className="font-semibold">An expiry date is a record, not a verdict.</strong> When one
                  passes, ValueBack flags it for review instead of silently writing the value off.
                </span>
              </li>
            </ul>
          </div>
          <Card className="p-5">
            <h3 className="font-semibold">What ValueBack is not</h3>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Being clear about this matters more than a feature list.
            </p>
            <ul className="mt-4 space-y-2.5 text-sm text-[var(--text-muted)]">
              <li>• Not a bank, wallet or payment processor. It never holds or moves money.</li>
              <li>• Not connected to any merchant, card issuer or loyalty programme. Balances are what you record.</li>
              <li>• Not a financial adviser. It organises your records; the decisions stay yours.</li>
              <li>• Not a guarantee. Whether a merchant honours a credit is between you and them.</li>
            </ul>
            <p className="mt-4 text-xs text-[var(--text-faint)]">
              This build stores everything in a local database on the machine it runs on.
            </p>
          </Card>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
          <h2 className="text-2xl font-semibold">Start with the one you nearly forgot</h2>
          <p className="mx-auto mt-3 max-w-xl text-[var(--text-muted)]">
            Add a single gift card or an open refund. It takes under a minute, and the deadline is watched
            from then on.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <LinkButton href="/signup">Start tracking for free</LinkButton>
            <LinkButton href="/features" variant="secondary">
              Browse the features
            </LinkButton>
          </div>
          <p className="mt-4 text-xs text-[var(--text-faint)]">
            Free plan, no card required — there is no payment system in this build at all.{' '}
            <Link href="/pricing" className="underline">
              See pricing
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
