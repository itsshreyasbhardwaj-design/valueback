import type { Metadata } from 'next';
import {
  BellRing,
  Copy,
  FileSearch,
  FolderDown,
  Gauge,
  Globe,
  Lock,
  Scale,
  Search,
  Users,
  Wallet,
  RotateCcw,
} from 'lucide-react';
import { Card, LinkButton } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Features',
  description:
    'Everything ValueBack does today: benefit tracking, refund cases, local document reading, reminders, analytics and household sharing.',
};

const GROUPS = [
  {
    icon: Wallet,
    title: 'Benefit tracking',
    body: 'Ten categories, from gift cards to travel vouchers. Money is stored in whole minor units with an explicit currency, so a balance never drifts by a rounding error. Records that are not monetary — a pack of ten classes — are counted in units instead.',
    points: [
      'Statuses: unverified, available, partially used, redeemed, expired per recorded terms, invalid, archived.',
      'Every balance change is an entry in an append-only ledger with a reason and a date.',
      'Redemption codes are encrypted with AES-256-GCM and shown masked.',
      'Recurring allowances top themselves up each month, quarter or year.',
    ],
  },
  {
    icon: RotateCcw,
    title: 'RefundWatch',
    body: 'A dedicated case file for money a merchant owes you, with a state machine that only allows sensible moves between statuses and records who made each change.',
    points: [
      'Eight statuses from "return requested" through to "received and confirmed" or "closed without receipt".',
      'A timeline of every event, with evidence attached.',
      'Partial receipts are supported; only the increment you confirm is counted as recovered.',
      'A follow-up message is drafted from the facts on your case, ready to copy.',
    ],
  },
  {
    icon: FileSearch,
    title: 'Document reading, on your machine',
    body: 'Upload a receipt, confirmation email or PDF. ValueBack extracts the text locally, guesses the type of benefit from the wording, and proposes values with a stated confidence and the snippet it came from.',
    points: [
      'PDF text, plain text and .eml email files are read directly.',
      'Photos and screenshots go through on-device OCR after a one-time model download.',
      'Nothing proposed is saved until you accept it on the review screen.',
      'Files are checked by their actual bytes, not by their filename.',
    ],
  },
  {
    icon: BellRing,
    title: 'ExpiryGuard reminders',
    body: 'Expiry dates and refund windows turn into reminders at 30, 14, 7, 3 and 1 days — or whatever schedule you prefer. Snooze, reschedule, complete or cancel each one.',
    points: [
      'An in-app notification centre with unread state that survives a restart.',
      'Optional browser notifications while a tab is open and you have granted permission.',
      'Reminders are de-duplicated, so running the scheduler twice never nags you twice.',
    ],
  },
  {
    icon: Gauge,
    title: 'Recovery intelligence',
    body: 'A transparent score decides what to surface first, and always shows its reasoning in plain language — "the recorded expiry is in 6 days and this has not been marked as used".',
    points: [
      'Factors: proximity to a recorded expiry, outstanding amount, evidence quality, time since the last action.',
      'Evidence is a category, never a made-up percentage.',
      'Possible duplicates are suggested and left for you to judge; nothing is merged automatically.',
    ],
  },
  {
    icon: Scale,
    title: 'Analytics that separate the figures',
    body: 'Reported, verified, pending and confirmed amounts are tracked separately and defined on screen. Different currencies are never added together, because there is no exchange-rate source.',
    points: [
      'Category split, refund status split, monthly recovery, expiry exposure, merchant summary.',
      'Every metric carries a one-line definition of exactly what it counts.',
      'Charts are plain SVG — they render on the server and work with JavaScript disabled.',
    ],
  },
  {
    icon: Users,
    title: 'FamilyValue sharing',
    body: 'Create a household and invite someone with a link you copy yourself. Sharing is per record: being in a household shows nobody anything until you explicitly share an item.',
    points: [
      'Roles: owner, member, viewer. A viewer can never edit, whatever the grant says.',
      'Invitations expire, can be revoked, and are stored only as a hash.',
      'Revoking access takes effect on the next request, including for records already opened.',
    ],
  },
  {
    icon: FolderDown,
    title: 'Export and import',
    body: 'Your records are yours. Export structured CSV, a full JSON file, or a .tar.gz containing the JSON plus every document you uploaded.',
    points: [
      'Redemption codes are excluded unless you ask for them and re-enter your password.',
      'Imports are validated row by row and report exactly what was skipped and why.',
      'Password hashes, sessions and keys are never exported.',
    ],
  },
  {
    icon: Search,
    title: 'Search and organisation',
    body: 'Search titles, merchants, notes, tags, conditions and order references — plus the text read out of your documents if you leave that on.',
    points: [
      'Filter by category, status, merchant, date range, expiring soon and archived.',
      'Sort by last update, expiry, value or title.',
      'Redemption codes are never searchable; they only exist encrypted.',
    ],
  },
];

export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold">Features</h1>
      <p className="mt-3 max-w-2xl text-[var(--text-muted)]">
        Everything listed here is implemented in this build. Where something depends on a service
        that is not connected, it says so rather than pretending.
      </p>

      <div className="mt-10 grid gap-5 lg:grid-cols-2">
        {GROUPS.map((g) => {
          const Icon = g.icon;
          return (
            <Card key={g.title} className="p-5">
              <Icon size={20} className="text-[var(--accent)]" aria-hidden />
              <h2 className="mt-3 text-lg font-semibold">{g.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{g.body}</p>
              <ul className="mt-3 space-y-1.5 text-[0.8125rem] text-[var(--text-muted)]">
                {g.points.map((p) => (
                  <li key={p} className="flex gap-2">
                    <span className="text-[var(--accent)]">•</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>

      <Card className="mt-8 p-5">
        <div className="flex items-start gap-3">
          <Lock size={20} className="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden />
          <div>
            <h2 className="text-lg font-semibold">Not available in this build</h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              These need an external service. Rather than fake them, ValueBack leaves them off and
              says so in the interface where you would expect them.
            </p>
            <ul className="mt-3 grid gap-1.5 text-[0.8125rem] text-[var(--text-muted)] sm:grid-cols-2">
              <li className="flex gap-2">
                <Globe size={14} className="mt-0.5 shrink-0" aria-hidden /> Email: no verification
                mail, no password-reset link, no sending your follow-up for you.
              </li>
              <li className="flex gap-2">
                <Copy size={14} className="mt-0.5 shrink-0" aria-hidden /> Follow-ups are copied to
                your clipboard and sent by you.
              </li>
              <li className="flex gap-2">
                <Globe size={14} className="mt-0.5 shrink-0" aria-hidden /> No merchant, bank or
                loyalty connections, so no live balance checks.
              </li>
              <li className="flex gap-2">
                <Globe size={14} className="mt-0.5 shrink-0" aria-hidden /> No payments: plans exist
                as an entitlement model, not a checkout.
              </li>
              <li className="flex gap-2">
                <BellRing size={14} className="mt-0.5 shrink-0" aria-hidden /> No push notifications
                once the app is closed — reminders need the app or the scheduler running.
              </li>
              <li className="flex gap-2">
                <Globe size={14} className="mt-0.5 shrink-0" aria-hidden /> No account recovery by
                email. Recovery codes you save yourself are the only route back in.
              </li>
            </ul>
          </div>
        </div>
      </Card>

      <div className="mt-10 flex flex-wrap gap-3">
        <LinkButton href="/signup">Start tracking for free</LinkButton>
        <LinkButton href="/how-it-works" variant="secondary">
          See how it works
        </LinkButton>
      </div>
    </div>
  );
}
