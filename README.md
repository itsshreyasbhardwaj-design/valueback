# ValueBack

**Don't lose value you've already paid for.**

ValueBack is a personal tracker for money you already hold or are owed: gift
cards, store credits, pending refunds, coupons, prepaid class packs, travel
vouchers and the rest. It keeps the evidence together, watches the deadlines,
and — this is the part most trackers get wrong — keeps what you *might* get
strictly apart from what you *actually got*.

It is not a bank, a wallet, a payment processor or a financial adviser. It
never holds or moves money, and it is not connected to any merchant.

Everything runs on your own machine. There is no third-party API call anywhere
in the product: no account to create, no key to paste, nothing uploaded.

---

## What it does

**CAPTURE → VERIFY → TRACK → REMIND → ACT → CONFIRM**

| | |
|---|---|
| **Benefits** | Ten categories, decimal-safe balances, an append-only ledger behind every number, AES-256-GCM encrypted redemption codes, recurring allowances. |
| **RefundWatch** | A case file per refund with an enforced state machine, a full timeline, partial receipts, and a follow-up message drafted from your own recorded facts. |
| **Documents** | Upload a PDF, photo, text file or saved email. Text is extracted *on this machine* — pdf.js for PDFs, Tesseract WASM for images, a built-in parser for `.eml`. Values are proposed with a confidence label and the snippet they came from; nothing is saved until you accept it. |
| **ExpiryGuard** | Reminders at 30/14/7/3/1 days before a recorded expiry (configurable), refund check-ins, snooze/reschedule/complete, an in-app notification centre, optional browser notifications. |
| **Recovery intelligence** | A transparent attention score that always explains itself in plain language, plus evidence labels instead of invented confidence percentages. |
| **Analytics** | Reported, verified, pending and confirmed amounts tracked separately, each with its definition on screen. Per-currency, never summed across currencies. |
| **FamilyValue** | Households with per-record sharing. Membership alone shows nobody anything. Invitations are single-use, expiring, and stored only as a hash. |
| **Your data** | CSV, JSON and `.tar.gz` exports (documents included), validated import, and a real account deletion that removes the files from disk. |

## What it deliberately does not do

These need a third-party service, so rather than fake them the app says so
where you would expect to find them:

- No email at all — no verification mail, no password-reset link, no sending
  your follow-up for you (it goes to your clipboard).
- No bank, card, merchant or loyalty connections, so no live balance checks.
- No payments. The plan model is real and enforced; there is no checkout, and
  no account has ever been charged.
- No push notifications once the app is closed.
- Account recovery only via codes you generate and save yourself.

---

## Requirements

- **Node.js 20.11 or newer** (developed and verified on Node 24.16)
- npm
- About 250 MB of disk for dependencies; the database is a single SQLite file

No Docker, no database server, no cloud account.

## Install and run

```bash
npm install          # install dependencies
npm run setup        # generate .env.local secrets, then migrate the database
npm run dev          # http://localhost:3000
```

`npm run setup` writes `.env.local` (mode 0600) containing a freshly generated
32-byte `APP_ENCRYPTION_KEY`. It never overwrites an existing file. See
[ENVIRONMENT.md](ENVIRONMENT.md).

### Production build

```bash
npm run build
npm start            # http://localhost:3000
```

### Optional: image text recognition

Reading text out of photos needs the open-source English Tesseract model, a
one-time ~3 MB download (no account, no key):

```bash
npm run fetch:ocr
```

Until you run it, images are stored and previewed but not read, and the app
says so rather than pretending. PDFs, text files and `.eml` emails are read
without it.

### Optional: reminders without the app open

Reminders are processed while you are using ValueBack. To have them processed
otherwise, run the bundled command from cron or a launchd job:

```bash
npm run reminders:run
```

It is idempotent — running it twice never produces a duplicate notification.

---

## Demo data

```bash
npm run seed:demo            # create the demo accounts
npm run seed:demo -- --reset # rebuild them from scratch
```

This creates `demo@valueback.local` and `demo-partner@valueback.local` with a
**password generated at random for that run and printed once**. Nothing is
hardcoded, so there is no shared secret in this repository.

The demo contains five benefits (one partially used, one past its recorded
expiry, one with no monetary value), three refund cases (one overdue, one
confirmed received, one partially received), a document read locally, and a
household with two members and two shared records. Every record is titled
`Example:` and carries a note marking it fictional, and the app shows a banner
on any `@valueback.local` account. A real account never sees any of it.

## Seeing it

With the dev server running, the pages worth a look are `/` (marketing),
`/app` (dashboard), `/app/benefits/<id>` (ledger and evidence), `/app/refunds/<id>`
(timeline and the follow-up draft), `/app/documents/<id>` (extraction review)
and `/app/analytics`. Sign in with the demo account above to see them populated.

---

## Test commands

```bash
npm run typecheck      # tsc --noEmit, strict
npm run lint           # eslint (next core-web-vitals + typescript)
npm run format:check   # prettier
npm test               # 219 unit and integration tests (vitest)
npm run e2e            # 32 end-to-end tests (playwright, production build)
npm run build          # production build
npm run audit          # npm audit for runtime dependencies

npm run verify         # typecheck + lint + format + unit + build
npm run verify:all     # the above, plus end-to-end
```

The first `npm run e2e` needs a browser: `npx playwright install chromium`.
See [TESTING.md](TESTING.md) for what is covered and the latest results.

## Deployment limitations — read before deploying

This build targets **one machine running one Node process**. Specifically:

- **SQLite is not a drop-in for serverless.** The database is a local file.
  Deploying to a stateless platform (Vercel functions, Lambda) would give each
  instance its own empty, disposable copy. The persistence layer is written to
  make a move to managed PostgreSQL mechanical — see [ARCHITECTURE.md](ARCHITECTURE.md) —
  but that move has not been made.
- **Uploaded files live on local disk** under `STORAGE_DIR`, for the same reason.
- **Rate limiting is in-process.** Several instances would each have their own
  counters.
- **No independent security assessment has been carried out.** [SECURITY.md](SECURITY.md)
  lists what is implemented and what the residual risks are.

A single VPS or a home server with a reverse proxy terminating HTTPS is a
reasonable target. Anything beyond that needs the Phase 3 work in
[ROADMAP.md](ROADMAP.md).

## Documentation

| File | Contents |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Technology choices, data model, service boundaries, security model, future adapters |
| [FEATURES.md](FEATURES.md) | Every implemented feature, its behaviour, its phase, its limits |
| [SECURITY.md](SECURITY.md) | Sensitive data handling, encryption, sessions, threat model, residual risks |
| [TESTING.md](TESTING.md) | Strategy, commands, coverage, actual verification results |
| [ROADMAP.md](ROADMAP.md) | What Phase 1 and Phase 2 delivered, what Phase 3 needs |
| [ENVIRONMENT.md](ENVIRONMENT.md) | Every configuration value, how secrets are generated, what is optional |

## Licence

[MIT](LICENSE). Use it, change it, ship it — just keep the copyright notice.

The warranty disclaimer is not boilerplate here: this build has had no
independent security assessment, and the privacy policy and terms it ships with
are drafts needing review. See [SECURITY.md](SECURITY.md).
