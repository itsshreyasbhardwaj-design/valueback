import type { Metadata } from 'next';
import { Card, LinkButton } from '@/components/ui';

export const metadata: Metadata = {
  title: 'How it works',
  description: 'The six steps behind ValueBack: capture, verify, track, remind, act, confirm.',
};

const STEPS = [
  {
    n: '01',
    title: 'Capture what you are owed',
    body: 'Add a record by hand in about thirty seconds, or upload the evidence you already have: a PDF receipt, a confirmation email saved as .eml, a screenshot, a photo of a card.',
    detail: [
      'Only a title and a category are required. An amount is optional, because a pack of classes or a "free dessert" coupon does not have one.',
      'Uploads are capped at 8 MB and validated by their actual content, not their file extension.',
      'A gift-card code can be stored; it is encrypted immediately and only ever shown masked.',
    ],
  },
  {
    n: '02',
    title: 'Verify before anything is saved',
    body: 'When a document is read, ValueBack shows you the text it found, what it thinks the document is, and each value it proposes — with the snippet that value came from and how confident it is.',
    detail: [
      'High, medium and low, with a sentence explaining the level. No invented percentages.',
      'You can correct any field before accepting, or ignore the suggestions entirely.',
      'An accepted value is marked "read from a document" so you can tell it apart from one you checked yourself.',
    ],
  },
  {
    n: '03',
    title: 'Track the balance honestly',
    body: 'Balances never get silently overwritten. Every change is an entry in a ledger: an opening balance, a partial use, a correction, a verified update, a full redemption, or a revalidation.',
    detail: [
      'Each entry records the amount, the reason, the date and who entered it.',
      'Recording usage counts as value you recovered. Correcting a mistake does not — a correction is not a recovery.',
      'The current balance shown always equals the sum of the ledger.',
    ],
  },
  {
    n: '04',
    title: 'Get reminded in time',
    body: 'An expiry date creates reminders at 30, 14, 7, 3 and 1 days before, and a refund case gets a check-in after the window you recorded. You can change every one of those numbers.',
    detail: [
      'Due reminders become notifications with unread state that persists.',
      'Snooze, reschedule, complete or cancel individually.',
      'Reminders only fire while the app or the bundled scheduler command is running — this is stated in the app, not hidden.',
    ],
  },
  {
    n: '05',
    title: 'Act on it',
    body: 'The dashboard ranks what deserves attention and explains why in plain language. For refunds, ValueBack drafts a polite follow-up from the facts already on the case.',
    detail: [
      'The draft never claims the merchant agreed to anything, broke a rule, or already paid.',
      'There is no email provider configured, so the draft is copied to your clipboard and you send it.',
      'Each follow-up you log appears on the case timeline with a date.',
    ],
  },
  {
    n: '06',
    title: 'Confirm what you actually got',
    body: 'A refund is only recorded as received when you say it arrived. Until then it stays in "pending", however long the merchant has had it.',
    detail: [
      'Partial receipts are supported — only the new increment is added to your recovered total.',
      '"Confirmed recovered" is built purely from these confirmations.',
      'Nothing is inferred from a date passing or a status changing.',
    ],
  },
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold">How ValueBack works</h1>
      <p className="mt-3 text-[var(--text-muted)]">
        Six steps, in order. The product is built so that each one can be checked by the person using it.
      </p>

      <ol className="mt-10 space-y-5">
        {STEPS.map((s) => (
          <li key={s.n}>
            <Card className="p-5 sm:p-6">
              <div className="flex items-baseline gap-3">
                <span className="nums text-sm font-bold tracking-widest text-[var(--accent)]">{s.n}</span>
                <h2 className="text-lg font-semibold">{s.title}</h2>
              </div>
              <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-[var(--text-muted)]">{s.body}</p>
              <ul className="mt-3 space-y-1.5 border-l-2 border-[var(--border)] pl-4 text-sm text-[var(--text-muted)]">
                {s.detail.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </Card>
          </li>
        ))}
      </ol>

      <Card className="mt-8 p-5">
        <h2 className="text-lg font-semibold">A worked example</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          You have a ₹1,000 store credit from a return. You spend ₹400 of it.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { label: 'Available, as reported', value: '₹600', note: 'what is left on the record' },
            { label: 'Confirmed recovered', value: '₹400', note: 'the part you recorded using' },
            { label: 'Counted twice', value: '₹0', note: 'the ledger prevents it' },
          ].map((x) => (
            <div key={x.label} className="rounded-lg border border-[var(--border)] p-3">
              <p className="text-xs font-medium text-[var(--text-muted)]">{x.label}</p>
              <p className="nums mt-1 text-xl font-semibold">{x.value}</p>
              <p className="mt-0.5 text-xs text-[var(--text-faint)]">{x.note}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-10">
        <LinkButton href="/signup">Start tracking for free</LinkButton>
      </div>
    </div>
  );
}
