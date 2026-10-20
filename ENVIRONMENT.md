# Environment and configuration

ValueBack needs **no third-party account, API key or credential**. Everything
below is local.

## Quick start

```bash
npm run setup
```

That writes `.env.local` with a freshly generated encryption key (file mode
0600) and then runs the database migrations. It never overwrites an existing
`.env.local`.

`.env.example` documents the same fields and is safe to commit — it carries no
values.

## Configuration values

| Name | Required | Default | What it does |
|---|---|---|---|
| `APP_ENCRYPTION_KEY` | **Yes**, to store redemption codes | none | 32 random bytes, base64. Encrypts gift-card and voucher codes with AES-256-GCM. Everything else works without it; saving a code throws a clear error if it is missing. |
| `DATABASE_URL` | No | `./data/valueback.db` | Path to the SQLite file. Relative paths resolve from the project root. The directory is created if needed. |
| `STORAGE_DIR` | No | `./storage` | Where uploaded documents are written. **Must be outside `./public`** — files are served only through an authorised route. |
| `SESSION_TTL_HOURS` | No | `720` (30 days) | Session lifetime. Applies to sessions created after the change. |
| `OCR_DATA_DIR` | No | `./ocr-data` | Where the Tesseract language model lives. |
| `VALUEBACK_DEV_PLAN_OVERRIDE` | No | unset | Set to `1` to expose a plan switcher in Settings so entitlement limits can be exercised. **Ignored when `NODE_ENV=production`.** |
| `NODE_ENV` | No | set by Next | Standard. |

There are no `NEXT_PUBLIC_*` variables: nothing in this configuration is sent
to the browser.

## Generating the key by hand

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Put the result in `.env.local` as `APP_ENCRYPTION_KEY=...`.

**Rotating it makes previously saved redemption codes unreadable.** Everything
else keeps working, and the interface says so when a decrypt fails. There is no
re-encryption routine; if you need one, decrypt with the old key and re-save
each code before switching.

## Runtime configuration is read at runtime

Next.js inlines statically written `process.env.NAME` references with the values
found in `.env` files **at build time**. A build made on one machine would
otherwise keep that machine's database path and secrets even when started with
different ones.

Every value above is therefore read through `readEnv()` in `src/lib/env.ts`,
which uses a dynamic key that cannot be statically replaced. If you add
configuration, use `readEnv()` — do not write `process.env.MY_THING` directly
in server code.

## Files on disk

| Path | Git | What |
|---|---|---|
| `.env.local` | ignored | Your secrets, mode 0600 |
| `data/valueback.db` | ignored | The database (plus `-wal` and `-shm` in WAL mode) |
| `storage/<user id>/<document id>.<ext>` | ignored | Uploaded documents, 0600 in 0700 directories |
| `ocr-data/eng.traineddata.gz` | ignored | The OCR model, ~3 MB, fetched on request |
| `drizzle/` | committed | Generated SQL migrations |
| `.playwright/` | ignored | The end-to-end database and storage |

Nothing secret is committed. `.gitignore` covers `.env*.local`, `data/`,
`storage/`, `ocr-data/`, `*.db*` and the test artefacts.

## Optional one-time downloads

```bash
npm run fetch:ocr            # ~3 MB English Tesseract model (Apache-2.0)
npx playwright install chromium   # only to run the end-to-end tests
```

Both are open-source assets from public CDNs. Neither needs an account, and
neither sends anything about you. Without the first, images are stored but not
read and the interface says so.

## Backing up and moving

Everything lives in three places: the database file, the storage directory and
`.env.local`. Copy all three together — the database references documents by
path, and the codes inside it are useless without the key.

```bash
# stop the app first
tar czf valueback-backup.tar.gz data/ storage/ .env.local
```

For a copy you can read without the app, use the in-app export instead:
Settings → Data and plan → Download archive.

## Scheduling reminders

Reminders are processed while someone is using the app. To process them
otherwise:

```bash
cd /path/to/valueback && npm run reminders:run
```

A crontab entry, hourly:

```cron
0 * * * * cd /path/to/valueback && /usr/local/bin/npm run reminders:run >> /tmp/valueback-reminders.log 2>&1
```

It is idempotent: running it twice on the same day creates no duplicate
notifications. It also tops up recurring allowances and purges expired
sessions.

## Ports

The dev server and `npm start` use 3000; the end-to-end suite uses 3100 so it
never collides with a running dev server. Change the port with
`next dev -p <port>` / `next start -p <port>`.

## Not configured, and why

| Thing | Status |
|---|---|
| Email provider | None. No verification, no password reset, no sending follow-ups. |
| Object storage | None. Documents are on local disk. |
| Payment provider | None. Plans are modelled; nothing can be bought. |
| Push service | None. Nothing is delivered to a closed app. |
| OAuth / social sign-in | None. |
| Analytics or telemetry | None, deliberately. No third-party scripts load. |
| Error reporting | None. Errors go to the server console. |
| Language-model API | None. Document understanding is deterministic parsing, and is described as such. |

Each of these is listed in [ROADMAP.md](ROADMAP.md) with what adopting it would
involve.
