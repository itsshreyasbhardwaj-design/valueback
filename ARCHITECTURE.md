# Architecture

## Technology choices

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16, App Router, React 19 | Server components keep the money logic on the server; server actions give form handling with built-in origin checking and progressive enhancement. |
| Language | TypeScript, `strict` plus `noUncheckedIndexedAccess` | The money paths are the whole product; an undefined array element silently becoming `NaN` is exactly the failure mode to design out. |
| Database | SQLite via better-sqlite3 | Zero setup, one file, synchronous API that suits request-scoped reads. WAL mode for concurrent readers. |
| ORM | Drizzle | Thin, typed, SQL-shaped. Its schema is also the migration source, and the same schema definition targets PostgreSQL later. |
| Validation | Zod v4 | One schema per trust boundary, in `src/lib/validation.ts`. |
| Styling | Tailwind CSS v4, CSS custom properties | Theme tokens live in `:root`; light and dark are two sets of the same variables, so a component never hardcodes a colour. |
| Icons | lucide-react | |
| Charts | Hand-written inline SVG | A chart library would have been ~40 KB of client JavaScript for four static charts. These render on the server, work with scripts disabled, and expose their data as text for screen readers. |
| PDF text | pdfjs-dist (legacy build) | Runs in Node, no native dependency. |
| Image text | tesseract.js | WASM, fully local. The language model is fetched once by an explicit command. |
| Password hashing | `node:crypto` scrypt | Memory-hard, in the standard library, no native build step. See SECURITY.md for the argon2id comparison. |
| Tests | Vitest, React Testing Library, Playwright | |

Ten runtime dependencies in total. Nothing was added that a few lines of
standard library could do — the tar writer for document archives, the `.eml`
parser and the charts are all in-repo for that reason.

## Shape of the system

```
src/
├── app/
│   ├── (site)/            marketing pages — server rendered, no app imports
│   ├── (auth)/            sign in, sign up, recovery + their server actions
│   ├── app/               the authenticated product
│   │   ├── layout.tsx     session gate, navigation, post-response reminder sweep
│   │   └── <area>/
│   │       ├── page.tsx   server component: reads through a service, renders
│   │       ├── actions.ts 'use server' — the only mutation entry points
│   │       └── panels.tsx 'use client' — forms with useActionState
│   └── api/               file serving and exports (things a form must POST to)
├── components/            presentation only; no database imports
└── lib/                   all business logic and persistence
```

The rule that keeps this honest: **a page never writes**. Reads go
`page.tsx → lib/<service>.ts → db`. Writes go
`panels.tsx → actions.ts → lib/<service>.ts → db`, and every action begins with
`requireUserForAction()`, which checks the request origin and resolves the
session before anything else runs.

## The service layer

| Module | Responsibility |
|---|---|
| `lib/db/schema.ts` | 20 tables, the single source of truth for shape and migrations |
| `lib/accounts.ts` | Registration, credential checks, password changes, sessions as data |
| `lib/auth.ts` | The request-bound half: cookies, session resolution, origin assertion |
| `lib/authz.ts` | Who may see or change what. Every record read goes through it |
| `lib/benefits.ts` | The ledger. The only writer of a balance |
| `lib/refunds.ts` | The refund state machine and the follow-up draft |
| `lib/documents.ts` | Upload validation, private storage, the extraction pipeline |
| `lib/extraction.ts` | Pure rules: classification and field proposals. No I/O, no database |
| `lib/eml.ts` | Pure `.eml` reader |
| `lib/reminders.ts` | Scheduling and the idempotent scheduler run |
| `lib/analytics.ts` | Every metric, with its definition attached to it |
| `lib/priority.ts` | Deterministic attention scoring with plain-language reasons |
| `lib/duplicates.ts` | Duplicate *suggestions*, owner-scoped |
| `lib/household.ts` | Households, invitations, per-record grants |
| `lib/exportdata.ts` | Export and import |
| `lib/money.ts` `lib/dates.ts` `lib/crypto.ts` `lib/tar.ts` | Pure primitives |

`lib/extraction.ts`, `lib/eml.ts`, `lib/money.ts`, `lib/dates.ts`,
`lib/priority.ts` and `lib/tar.ts` are pure functions with no imports from the
database. That is what makes the hard parts cheap to test.

## Data model

Twenty tables. The ones that carry the product's meaning:

**Identity** — `users`, `sessions` (only a SHA-256 of the cookie token is
stored), `recovery_codes` (hashed), `user_settings`, `entitlements`.

**Benefits** — `benefits` holds the descriptive record plus a *cached* current
balance. `balance_events` is the append-only ledger that the cache is derived
from: every row records a type, a signed delta, the resulting balance, a
reason, a date and who entered it. `recomputeBalanceFromLedger()` recalculates
from the ledger alone, a unit test asserts the two agree, and the Settings page
runs the same check across every record and reports any disagreement.

**Refunds** — `refund_cases` with `refund_events` (every status change, with
the actor) and `claim_actions` (follow-ups, assignable to a household member).

**Documents** — `documents` (bytes on disk, hash, extracted text) and
`extractions` (what the parser proposed, and separately what the user accepted).

**Sharing** — `households`, `household_members`, `household_invites`
(hashed tokens, expiry, revocation) and `access_grants`. A grant is per record.

**Outcomes** — `recovery_events` is the only source of "value actually
recovered", and `audit_log` records actions with money, codes and free text
stripped out before writing.

### Money

Integer minor units plus an explicit ISO-4217 code, everywhere. No float ever
touches a balance: `parseMoneyToMinor` does integer arithmetic on the digit
string, and the only division is inside the display formatter. Currencies are
never added together — there is no rate source, so a combined figure would be a
guess presented as a fact.

### Dates

Calendar dates are `YYYY-MM-DD` text; instants are ISO-8601 UTC strings. Both
sort lexicographically in SQL and both map onto PostgreSQL `date` and
`timestamptz` without conversion.

### The no-double-counting rule

Outstanding value is read from `benefits.current_value_minor`. Recovered value
is read from `recovery_events`. The two tables never describe the same rupee:
recording ₹400 of usage against a ₹1,000 credit writes a `-40000` ledger row,
updates the cache to `60000`, and inserts one recovery event of `40000` — in a
single transaction. Pending refunds count `amount - received`, so confirming
half a refund moves exactly half across. Metrics that are slices of another
metric carry a `subsetOf` field so the interface cannot add them to their
parent. Six tests in `tests/analytics.test.ts` hold this down.

## Security model

Summarised here; the detail and the residual risks are in [SECURITY.md](SECURITY.md).

- **Sessions** are server-side rows; the cookie holds an opaque 32-byte token
  and only its hash is stored. HTTP-only, SameSite=Lax, `Secure` whenever the
  request is not on a loopback host.
- **Authorization** is re-evaluated on the server for every record access.
  `authz.ts` returns the same "not found" for a record that exists but is not
  yours as for one that does not exist.
- **Household membership grants nothing.** An `access_grants` row for that
  exact record is required, and a `viewer` is capped at read-only regardless.
- **Uploads** are identified by their bytes, not their filename, stored outside
  the web root, and served only through a route that re-checks access.
- **Redemption codes** are encrypted with AES-256-GCM, shown masked, excluded
  from search, excluded from logs, and excluded from exports unless the user
  re-enters their password.
- **Rate limiting** on sign-in, sign-up, password change, recovery, uploads and
  invitation acceptance.

## Adapters for later

Extension points exist only where the replacement is already known. There is no
interface with a single implementation written "for flexibility".

| Concern | Today | What a change touches |
|---|---|---|
| Database | `lib/db/index.ts` constructs the Drizzle client; everything else imports `db` | Swap the driver and the dialect import. Queries are Drizzle, not raw SQL. The ids, date formats and integer money were all chosen to port unchanged. |
| File storage | `lib/documents.ts` — `storageDir()`, `storeDocument`, `readDocumentBytes`, `deleteDocument` | Four functions to reimplement against object storage. Callers only pass document rows. |
| Image OCR | `lib/ocr.ts` exposes `ocrAvailable()` and `ocrImage()` | A hosted OCR service, or a better local model, replaces one file. The pipeline already handles "unavailable" as a first-class outcome. |
| Outbound email | Nothing exists | The follow-up draft is already built by a pure function (`buildFollowUpDraft`) that returns a subject and a body. A provider would consume that; no other code changes. |
| Payments | `lib/entitlements.ts` holds plan limits and `setPlan()` | A webhook writes the plan. Limits are already checked on the server before a record is created. |
| Push notifications | `lib/reminders.ts#runDueReminders` writes notification rows | A sender reads unsent rows. The dedupe key already prevents double delivery. |

## Performance

- Server components by default; client JavaScript only where a form, a tab, a
  theme toggle or the clipboard needs it.
- Charts are SVG rendered on the server — no chart library ships to the browser.
- No web fonts: the system font stack means no network request and no layout
  shift.
- Indexed queries for every list and filter; benefit and refund lists paginate
  at 20 rows.
- Document text extraction happens once, at upload, and is stored.
- The reminder sweep runs in `after()`, so it never delays a response.

No benchmark numbers are quoted here because none have been measured on
representative hardware with representative data.
