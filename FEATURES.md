# Features

Status values used below:

- **Done** — implemented and covered by an automated test
- **Done (untested)** — implemented and exercised by hand, no automated test
- **Partial** — works, with a stated gap
- **Not implemented** — and why

---

## Phase 1 — functional foundation

### Brand and design system — Done
Tokenised palette (deep navy, emerald, warm white, slate) as CSS custom
properties, with light and dark as two sets of the same variables. One focus
style, never removed. Tabular figures on every money column. Reusable
components in `src/components/ui.tsx`. Theme is read from a cookie on the
server so the first paint is already correct; `prefers-reduced-motion` is
respected.

### Marketing site — Done
Home, Features, How it works, Pricing, FAQ, Privacy, Terms, Contact, plus sign
in and sign up. Real content throughout: no invented testimonials, awards,
customer counts, integrations or savings claims. The home page carries an
interactive product preview whose data is labelled "Example data" on screen and
again underneath. Legal pages are labelled drafts needing review.

### Authentication — Done
Registration, sign in, sign out, server-side sessions in HTTP-only cookies with
expiry, protected routes, password change (which signs out every other
session), recovery codes, and account deletion. Rate limits on sign-in,
sign-up, password change and recovery.

*Deliberately absent:* email verification and password-reset email. No provider
is configured, and a reset link that goes nowhere is worse than none. The
sign-up page says so, and recovery codes are offered instead.

### Onboarding — Done
Six steps: welcome, why it helps, what you want to track, add your first
record, how reminders work, the dashboard. Every step is skippable and progress
is persisted, so closing the tab does not restart it.

### Dashboard — Done
Eight headline figures kept strictly apart: available as reported, of which
verified, pending refunds, expiring within 30 days, past recorded expiry,
confirmed recovered, unresolved claims, upcoming actions. Each carries its
definition. Sections for Needs attention (ranked, with reasons), Upcoming
deadlines, Pending refunds, My benefits, Recovery activity and a 6-month chart.
Every figure comes from the database; a new account sees a purpose-built empty
state rather than zeros.

### Benefit management — Done
Ten categories. Title and category are the only required fields — an amount is
optional, because a free-dessert coupon does not have one. Optional: merchant,
currency, original value, remaining value, units and unit label, issue/receipt/
expiry dates, conditions, notes, tags, redemption code, recurrence.

Statuses: unverified, available, partially used, redeemed, expired per recorded
terms, invalid, archived — with a transition table enforced on the server.

Balance changes are append-only ledger entries: opening balance, usage,
correction, verified update, full redemption, revalidation. Each records a
signed delta, the resulting balance, a reason, a date and who entered it. The
displayed balance is a cache of that ledger, written in the same transaction,
and the Settings page re-derives every balance from its ledger and reports any
disagreement.

An expiry date passing never changes a status by itself. The record is flagged
for review with an explanation, and revalidation records a new date.

### RefundWatch — Done
Merchant, order reference, refund reference, purchase date, initiation date,
expected-by date, method, amount, notes. Eight statuses with an enforced
transition table, a timeline recording the actor and date of every change,
partial receipts, and a locally generated follow-up draft.

The draft states only facts already on the case. It never asserts that the
merchant agreed, paid, or broke a rule — there is a test that greps for exactly
those claims. It is copied to the clipboard; ValueBack cannot send it.

### Documents — Done
JPG, PNG, WEBP, PDF, TXT and EML, up to 8 MB, validated by their actual bytes
rather than their filename or declared type. Stored outside the web root and
served only through an authorised route. Text extraction: pdf.js for PDFs (20
pages max), the built-in parser for `.eml`, Tesseract WASM for images.

### Expiry tracking and in-app reminders — Done
Expiry dates generate reminders at 30/14/7/3/1 days before, configurable per
account. Refund cases get a check-in, due immediately if the recorded window
has already passed. Snooze, reschedule, complete, cancel. The notification
centre keeps unread state across restarts. Running the scheduler twice never
produces a duplicate.

### Profile, settings, search, filtering, history, analytics — Done
Covered under Phase 2 below where the Phase 2 work extended them.

---

## Phase 2 — intelligent organisation

### Document scanning and rule-based classification — Done
Keyword rules with weights across all ten categories plus "refund case", and a
threshold below which the app declines to guess rather than picking the least
bad option. The review screen explains which phrases drove the classification.

### Structured extraction — Done
Merchant, order reference, amount, currency, issue date, expiry date, refund
window, redemption code, conditions and a title. Each proposal carries a
three-level confidence label and the snippet it was read from.

Confidence is a label, not a percentage, and the screen says so. A percentage
would imply a calibration this does not have. Refund windows take the later
bound of a range ("7–10 days" → 10) so the app never claims a merchant is late
when they are not.

### Extraction review and correction — Done
Nothing extracted is ever saved to a record by itself. The review screen shows
the document, the text that was read, the classification and its reasons, every
proposed value with its evidence, and suggested next steps. Accepting opens a
pre-filled form that can be corrected before saving; the resulting record is
marked "From a document", and what was accepted is stored alongside what was
proposed.

A detected redemption code is shown as `••••` on the review screen and never
echoed into an evidence snippet.

### Duplicate detection — Done
Benefits are matched on merchant, title, original value, issue date, expiry
date and code ending; refund cases on order reference, refund reference, amount
and purchase date within three days; documents on SHA-256 of their contents.
Results are labelled "likely the same" or "possibly the same" with the matching
signals listed. Nothing is ever merged or deleted automatically, and every
query is scoped to the owner's own rows, so deduplication can never surface
another person's data.

### Recovery confidence indicators — Done
Evidence categories: entered by you, read from a document, confirmed by you,
re-verified. "Provider verified" exists in the model but is unreachable,
because no authorised provider connection exists — the app will not display a
confirmation it cannot stand behind.

### Benefit priority ranking — Done
A deterministic score from proximity to a recorded expiry, outstanding amount,
units remaining, evidence quality, time since the last action and refund
status. Every point added produces a sentence; the interface shows the
sentences. Scores are an ordering device and are described as such.

### Claim timelines and suggested follow-ups — Done
Refund timelines show every status change with its actor and date. Follow-ups
are logged with a kind, a summary, an optional due date and an optional
household assignee. The review screen suggests next steps derived from what the
document actually said.

### EML import — Done
Headers (including encoded-word subjects), quoted-printable and base64 bodies,
multipart traversal preferring `text/plain`, and HTML stripped when that is all
there is. The sender and date become high-confidence hints for merchant and
issue date.

### FamilyValue — Done
Households with owner, member and viewer roles. Invitations are single-use,
expire in 72 hours, can be revoked, and exist only as a hash plus a link the
owner copies by hand.

Sharing is per record and owner-controlled. Membership grants nothing. A viewer
is read-only even if a grant says edit. Revoking a share, removing a member,
leaving or deleting the household all cut access on the next request, and
leaving also unshares whatever the leaver had shared. Eleven authorization
tests and two end-to-end journeys cover this.

### Recurring prepaid benefits — Done
Monthly, quarterly or yearly allowances top up once per period, idempotent
across repeated runs, recorded as a ledger entry like everything else.

### Notification preferences and browser notifications — Partial
In-app notifications and the full preference set are Done. Browser
notifications work while a ValueBack tab is open and permission has been
granted; permission state is read through `useSyncExternalStore`.

*The gap:* nothing is delivered once the app is closed. That needs a push
service, which does not exist here. The Reminders page states this plainly
rather than implying delivery.

### Data export and import — Done
CSV per record type, a full JSON export, and a `.tar.gz` containing the JSON
plus every uploaded file. Exports never contain a password hash, a session, the
encryption key, or anything belonging to another account. Redemption codes are
excluded unless explicitly requested, which requires re-entering the password
and acknowledging a warning; the archive README repeats it.

Import validates row by row and reports what was created, what was skipped as a
duplicate (with the matching signals) and what was rejected (with the reason).

### Improved search — Done
Titles, merchants, notes, tags, conditions, categories, order references and —
if you leave the setting on — text read from documents. Filters for category,
status, merchant, expiry window, archived state and date range; sorting by
update, expiry, value or name. Redemption codes are encrypted and therefore not
searchable, by design.

*Not implemented:* saved views. The directive marked them "if feasible"; they
were cut in favour of the authorization and analytics work.

### Responsive design and accessibility — Done
Sidebar on desktop, compact menu plus a bottom tab bar with a persistent Add
action on mobile. Five end-to-end tests assert no horizontal overflow at phone
width across five pages and that the form controls are touch-sized.

Accessibility: semantic landmarks, a skip link, labels tied to every control,
`aria-invalid` and `role="alert"` on errors, `aria-current` on navigation,
`aria-busy` while submitting, keyboard-reachable tabs with correct ARIA, charts
with text equivalents, and visible focus everywhere. Contrast was chosen for
WCAG AA in both themes.

*Not claimed:* a full WCAG 2.2 AA audit, or testing with a real screen reader.

### Automated testing — Done
219 unit and integration tests, 32 end-to-end tests. See [TESTING.md](TESTING.md).

---

## Plans and entitlements — Partial by design

The entitlement model is real: each account has a plan, and limits (active
records, monthly uploads, household spaces) are enforced on the server before a
record is created.

There is no checkout and no payment provider, so every account is on Free. Two
honest consequences:

1. The pricing page says so, and its paid buttons are disabled with a reason
   rather than leading somewhere that cannot work.
2. Household sharing is listed under the Family plan, but the Free plan
   includes **one** household space. Gating it to a plan nobody can buy would
   leave a shipped feature unreachable. The limit lives in one table in
   `src/lib/entitlements.ts`, and the pricing page states the choice.

A development-only plan switch exists behind `VALUEBACK_DEV_PLAN_OVERRIDE=1`
and is ignored in production builds.

---

## Known limitations

| Limitation | Detail |
|---|---|
| No email | No verification, no reset link, no sending follow-ups. Recovery codes are the only route back into an account. |
| No provider connections | Every balance is one you recorded. No live checks, so "Provider verified" is unreachable. |
| No payments | Plans are modelled and enforced; nothing can be bought. |
| Reminders need a running process | The app or `npm run reminders:run`. Nothing reaches a closed app. |
| Image OCR needs a one-time download | `npm run fetch:ocr`. Until then images are stored but not read, and the app says so. |
| Scanned PDFs | A PDF with no text layer cannot be read. The app explains why and suggests uploading an image instead. |
| Single currency per figure | No rate source, so amounts in different currencies are never added. |
| SQLite and local disk | One machine, one process. Not serverless. |
| In-process rate limiting | Several instances would each have their own counters. |
| No saved views | Cut; filters are URL-based, so a filtered view can be bookmarked. |
| No 2FA | Not implemented. |
| Email address cannot be changed | Not implemented; it is the sign-in identifier. |
| No security audit | No independent assessment has been carried out. |
