# Testing

## Strategy

Three layers, chosen so the expensive ones stay small:

1. **Unit tests** over the pure modules — money arithmetic, date parsing,
   document classification and extraction, `.eml` parsing, priority scoring,
   the tar writer. No database, no I/O, fast enough to run constantly.
2. **Integration tests** over the service layer against a **real SQLite
   database**, migrated from the real migration files. Nothing is mocked:
   `createBenefit` really writes rows, `transitionRefund` really enforces the
   state machine, `getBenefitFor` really refuses another account. Mocking the
   database would have tested the mock.
3. **End-to-end tests** in Chromium against a **production build**, driving the
   real forms and server actions, with its own database and storage directory.

Each unit/integration file gets its own freshly migrated database in a temp
directory (`tests/setup.ts`), so files are isolated and the developer's own
`data/valueback.db` is never touched. End-to-end runs reset their database
before the server starts.

What is deliberately *not* mocked: the database, the filesystem, pdf.js,
Tesseract, the password hasher, the encryption. What is unavoidably not
covered by unit tests: `src/lib/auth.ts`, which is bound to `next/headers` and
is exercised end-to-end instead.

## Commands

```bash
npm run typecheck          # tsc --noEmit (strict, noUncheckedIndexedAccess)
npm run lint               # eslint
npm run format:check       # prettier
npm test                   # vitest run        — 232 tests
npm run test:watch         # vitest
npx vitest run --coverage  # with a coverage report
npm run e2e                # playwright         — 32 tests
npm run build              # production build
npm run audit              # npm audit --omit=dev

npm run verify             # typecheck + lint + format + unit + build
npm run verify:all         # the above plus end-to-end
```

The first end-to-end run needs a browser: `npx playwright install chromium`.

## What the unit and integration tests cover

| File | Tests | Covers |
|---|---:|---|
| `money.test.ts` | 11 | Minor-unit parsing and formatting, grouping separators, currency symbols, zero-decimal currencies, round-trips, **and an explicit proof that 100,000 additions of ₹0.07 stay exact** |
| `dates.test.ts` | 9 | Month/year/leap-year arithmetic, strict ISO validation, the three display formats, loose date parsing from documents, day-first disambiguation, relative windows |
| `extraction.test.ts` | 18 | Classification of gift cards, refunds and prepaid packs, refusal to guess from one weak keyword, labelled-value extraction with confidence, codes never echoed into evidence, refund-window ranges, `.eml` headers/quoted-printable/multipart/HTML |
| `benefits.test.ts` | 21 | Creation, optional amounts, unit tracking, code encryption, partial usage, over-spending refusal, exhaustion, corrections and verified updates **not** counting as recovery, append-only history, expiry never auto-changing status, revalidation, transition rules, filtering, recurring allowances |
| `refunds.test.ts` | 14 | The state machine, illegal transitions refused server-side, actor recording, nothing counted until confirmed, **two-part receipts counted once**, over-confirmation refused, overdue detection, and that the follow-up draft never claims agreement, payment or wrongdoing |
| `analytics.test.ts` | 14 | The ₹1,000 − ₹400 case, pending→recovered movement, subset flags, definitions present, past-expiry exclusion, archived exclusion, **currencies never summed**, chart data, empty accounts |
| `authz.test.ts` | 22 | Cross-account isolation for benefits, refunds and documents; identical errors for "missing" and "not yours"; membership granting nothing; view grants not editing; viewer role capping an edit grant; only owners sharing; revocation, removal, leaving, deletion; invitation hashing, expiry, revocation and single use |
| `reminders.test.ts` | 21 | Offset parsing, scheduling from expiry, skipping past offsets, clearing on archive, idempotent re-sync, overdue refund check-ins firing immediately, **scheduler idempotency**, per-account scoping, snooze/complete, preference respected |
| `documents.test.ts` | 15 | Magic-byte sniffing, renamed-file refusal, binary-as-text refusal, private storage, size limits, duplicate hashing scoped per account, text/PDF/`.eml` pipelines, damaged PDFs reported honestly, deletion removing the bytes |
| `export.test.ts` | 17 | JSON contents, **no password hash / session / key / other accounts**, codes excluded by default, CSV escaping and decimals, tar structure and checksum, archive warnings, import validation and duplicate reporting |
| `accounts.test.ts` | 23 | Registration and normalisation, credential checks, **timing parity between a wrong password and a missing account**, password change, scrypt salting and parameters, unicode normalisation, AES-GCM round-trip and tamper detection, recovery-code format and hashing, audit-log redaction, plan limits |
| `priority-duplicates.test.ts` | 16 | Score ordering, plain-language reasons, past expiry flagged for review, zero for closed records, bands, refund escalation, evidence labels without percentages, duplicate strength and owner scoping |
| `search-ratelimit.test.ts` | 13 | Search across fields, **codes never searchable**, document-text opt-out, cross-account isolation, rate-limit windows, key independence, expiry, bucket sweeping |
| `components.test.tsx` | 17 | MetricCard currencies and subset labelling, definitions exposed to assistive tech, product-preview tab interaction, field/label/error wiring, alert roles, chart text equivalents |

## End-to-end coverage

All twenty required journeys, mapped:

| # | Journey | Where |
|---|---|---|
| 1 | New user registers | `core-journey` 1-2 |
| 2 | Completes onboarding | `core-journey` 1-2 (all six steps, plus progress persistence) |
| 3 | Adds a gift card | `core-journey` 3-6 |
| 4 | Dashboard updates | `core-journey` 3-6 |
| 5 | Records partial usage | `core-journey` 3-6 |
| 6 | Remaining balance updates | `core-journey` 3-6 |
| 7 | Uploads a receipt | `core-journey` 7-8 |
| 8 | Extraction is reviewed | `core-journey` 7-8 (asserts nothing is saved before acceptance) |
| 9 | Creates a refund case | `core-journey` 9-11 |
| 10 | Records a follow-up | `core-journey` 9-11 |
| 11 | Confirms refund receipt | `core-journey` 9-11 |
| 12 | Analytics without double counting | `core-journey` 3-6 and 9-11 |
| 13 | Creates a reminder | `core-journey` 13-14 |
| 14 | Reminder appears when due | `core-journey` 13-14 (and does not fire twice) |
| 15 | Creates a household | `household` 15-18 |
| 16 | Another account joins by invitation | `household` 15-18 |
| 17 | Household permissions enforced | `household` 15-18, and the edit-grant test |
| 18 | Revoked access no longer works | `household` 15-18, plus member removal |
| 19 | Exports data | `core-journey` 19 (CSV, JSON, archive, password gate) |
| 20 | Sign out, protected routes inaccessible | `core-journey` 20 |

Plus: persistence across a fresh browser context; corrupt and empty uploads;
damaged PDFs; missing required fields; nonsense amounts; over-spending;
missing refund amount; illegal transitions absent from the UI *and* refused;
duplicate uploads flagged not merged; duplicate benefits suggested not merged;
one account unable to reach another's record, document page or raw file; the
file route refusing anonymous requests; clean redirects and 404s; a revoked
invitation; a forged invitation code; the pricing page's disabled buttons; and
five mobile-viewport checks (no horizontal overflow on five pages, tab bar,
compact menu, touch target sizes, a form submitted at phone width).

## Verification results

Run on 20 October 2026, macOS 15 (arm64), Node v24.16.0, from a clean checkout.

| Check | Command | Result |
|---|---|---|
| Type checking | `npm run typecheck` | **Pass** — no errors, strict mode |
| Linting | `npm run lint` | **Pass** — 0 errors, 0 warnings |
| Formatting | `npm run format:check` | **Pass** |
| Unit + integration | `npm test` | **Pass** — 232 passed, 0 failed, 13 files, ~9 s |
| End-to-end | `npm run e2e` | **Pass** — 32 passed, 0 failed, 4 files, ~55 s |
| Production build | `npm run build` | **Pass** — 32 routes |
| Runtime dependency audit | `npm run audit` | **Pass** — 0 vulnerabilities |
| Full dependency audit | `npm audit` | 9 advisories, all dev-only (see SECURITY.md) |

### Coverage

`npx vitest run --coverage`, scoped to `src/lib` (the business logic):

```
All files        77.2 % statements   68.2 % branches   79.2 % lines
```

Notable modules:

| Module | Statements |
|---|---:|
| `money.ts` | 94 % |
| `dates.ts` | 97 % |
| `crypto.ts` | 93 % |
| `extraction.ts` | 91 % |
| `documents.ts` | 88 % |
| `exportdata.ts` | 88 % |
| `reminders.ts` | 87 % |
| `analytics.ts` | 87 % |
| `authz.ts` | 85 % |
| `priority.ts` | 82 % |
| `refunds.ts` | 77 % |
| `benefits.ts` | 74 % |
| `auth.ts` | 0 % (request-bound; covered end-to-end) |

The uncovered remainder is mostly error branches that need a failing
filesystem or a corrupted database to reach, and `auth.ts`, which cannot run
outside a Next request.

## Defects found by the tests

Kept here because "all tests pass" means little without knowing what they
caught:

1. **`parseMoneyToMinor('Rs.999')` returned 99 paise.** The full stop in a
   currency abbreviation was treated as a decimal point. Fixed by only reading
   a dot as a decimal point when a digit precedes it, or when the value starts
   with one.
2. **PDF extraction never worked.** `standardFontDataUrl` was missing its
   trailing separator, so every standard-font lookup failed and the whole read
   threw — swallowed into a friendly "could not be read". Found because a test
   asserted on the extracted text rather than on the error path.
3. **The in-app "check now" ran every account's scheduler**, not the signed-in
   one's. Found because reminder counts in a shared test database were higher
   than the test created.
4. **`.env.local` was inlined into the production build**, so a server started
   with a different `DATABASE_URL` silently used the build machine's path.
   Found when end-to-end exports returned 401 against a database that looked
   correct but was empty. All runtime config now reads through a dynamic key.
5. **The session cookie was `Secure` purely from `NODE_ENV`**, breaking POSTs
   in the documented `npm run build && npm start` flow over `http://localhost`.
   Now decided by the request protocol.
6. **`requireUser()` threw instead of redirecting**, and because pages render
   in parallel with their layout, an unauthenticated hit logged a server error
   before the layout's redirect won.
7. **Refund windows expressed as a range** ("7–10 business days") were not
   parsed at all; now parsed to the later bound so the app never calls a
   merchant late early.

## Running tests yourself

```bash
npm test -- tests/analytics.test.ts   # one file
npm test -- -t "double counting"      # one name
npm run e2e -- --headed               # watch the browser
npm run e2e -- --project=mobile-chromium
npx playwright show-report            # after a run
```
