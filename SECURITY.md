# Security

ValueBack stores records *about* money. It never holds or moves any, and it
holds no payment instrument. What it does hold is worth protecting: gift-card
codes are bearer instruments, and a refund history is a detailed purchase
history.

**This build has not had an independent security assessment.** Nothing below
should be read as a claim that it is secure against a determined attacker. It
is a description of what is implemented and what is not.

---

## Threat model

**Defended against**

- Another signed-in user of the same installation reading or changing records
  that are not theirs, including by guessing a URL or a document id.
- A household member seeing records that were not explicitly shared with them,
  or acting on a record they only have view access to.
- An attacker with a copy of the database reading passwords, session tokens,
  invitation tokens or gift-card codes.
- Cross-site requests from another origin performing actions as a signed-in user.
- Credential stuffing and brute force at a crude rate.
- Uploads disguised as a permitted type, or escaping the storage directory.
- SQL injection, via parameterised queries throughout.
- Stored XSS through record fields, via React's escaping.

**Not defended against**

- An attacker with filesystem access to the server. The encryption key sits in
  `.env.local` on the same machine; it protects a stolen database file, not a
  stolen machine.
- A compromised dependency. There are ten runtime dependencies and `npm audit`
  reports zero vulnerabilities in them, which is a floor, not a guarantee.
- A user who installs this on a shared machine and leaves it signed in.
- Denial of service. Rate limits are for abuse, not for load.
- Anything requiring a second factor: there is no 2FA.

---

## Passwords

Hashed with **scrypt** from `node:crypto`: N=32768, r=8, p=1, 64-byte key,
16-byte random salt, parameters stored alongside the hash so they can be raised
later without invalidating existing accounts. Roughly 32 MB of memory per
verification.

*Why not argon2id?* The directive asked for argon2id "or an equivalent
reputable scheme". Every argon2 binding for Node is a native module needing a
build toolchain, which conflicts with the requirement that this install with no
setup. scrypt is memory-hard, specified in RFC 7914, in the standard library,
and strictly better than any pure-JS argon2. If a native dependency becomes
acceptable, `hashPassword`/`verifyPassword` in `src/lib/crypto.ts` are the only
two functions to change; the stored format already carries its algorithm name.

Passwords are NFKC-normalised before hashing, so a decomposed accent typed on a
different keyboard still matches. Comparison is `timingSafeEqual`.

Sign-in runs a scrypt hash even when the address is unknown, so response time
does not reveal whether an account exists. A test asserts the two paths stay
within 5× of each other.

Minimum length 10, maximum 200. No composition rules — length beats symbol
soup, and arbitrary rules push people towards `Password1!`.

## Sessions

A 32-byte random token in an HTTP-only cookie. **Only its SHA-256 is stored**,
so a database read cannot be replayed into a session. Server-side expiry is
checked on every request and expired rows are deleted on sight.

Cookie flags: `HttpOnly`, `SameSite=Lax`, `Path=/`, an explicit expiry, and
`Secure` whenever the request is not on a loopback host. (`Secure` is decided
by the request protocol rather than `NODE_ENV`, because a local production
build is served over `http://localhost` and a Secure cookie there silently
breaks form POSTs.)

Changing the password revokes every other session. Settings lists active
sessions and can revoke them all.

## Account recovery

Eight single-use codes, generated on request after re-entering the password,
shown exactly once, and stored as scrypt hashes. Using one consumes it and
signs the user in to change their password. Generating a new set invalidates
the old one.

With no password and no code, the account cannot be recovered by anyone. That
is the honest consequence of having no email provider and no identity check,
and the interface says so rather than implying a support route exists.

## Authorization

Every record access goes through `src/lib/authz.ts`, on the server, on every
request. Ownership is the only implicit access.

A record that exists but belongs to someone else returns **the same error as
one that does not exist** — a test asserts the two messages are byte-identical,
so the 404 does not become an existence oracle.

Household membership grants nothing by itself. A live `access_grants` row for
that exact record, in a household the viewer belongs to, is required. A member
whose role is `viewer` is capped at read-only even if the grant says edit. Only
the owner of a record can share it or stop sharing it.

Documents inherit the access of the record they are attached to; an unattached
document is owner-only.

Twenty-two authorization tests and two end-to-end journeys cover isolation,
grants, role caps, revocation, member removal, leaving, household deletion and
invitation abuse.

## Redemption codes

Encrypted with **AES-256-GCM** (authenticated), a fresh 12-byte IV per value,
in an envelope tagged `v1`. A tampered envelope fails authentication and
returns null rather than garbage.

The key is 32 random bytes in `.env.local`, generated by `npm run setup`, mode
0600, git-ignored. Losing it makes stored codes unreadable; nothing else is
affected, and the interface says so.

Codes are shown masked (`••••4321`), revealed only by an explicit action that
is audited (the code itself never is), never written to logs, never searchable,
never echoed into an extraction evidence snippet, and excluded from exports
unless the user re-enters their password and acknowledges the warning.

## Request integrity (CSRF)

Three layers:

1. Next.js verifies the origin of every server action.
2. The session cookie is `SameSite=Lax`.
3. Every mutating entry point — action or route handler — calls
   `assertSameOrigin()`, which rejects a request whose `Origin` does not match
   the serving host.

Exports are POST-only for this reason, even though they only read: a GET would
be reachable from a link on another site.

## Uploads

- Type determined by **magic bytes**, not by filename or declared Content-Type.
  A renamed ELF or ZIP is refused.
- Text-ish files must decode as UTF-8 without control-character noise.
- 8 MB cap, enforced server-side.
- Written under `STORAGE_DIR/<user id>/<document id>.<ext>`, outside the web
  root, directories 0700 and files 0600.
- `documentAbsolutePath()` re-resolves and asserts the result is inside the
  storage root, so a crafted path cannot escape.
- Served only by `/api/documents/[id]/file`, which re-checks access and sends
  `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff` and
  `Content-Security-Policy: default-src 'none'; sandbox`.
- Monthly upload limits per plan.

## Rate limiting

Fixed-window counters, in process memory: sign-in 10/15 min per address,
sign-up 5/hour, password change and code-bearing export 5/15 min, recovery
5/hour, uploads 60/hour, invitation acceptance 20/hour.

**Residual risk:** in-process means several instances each have their own
counters, and a restart clears them. The call sites are unchanged by swapping
the Map for a shared store; that is noted in `src/lib/rate-limit.ts`.

## Input validation

Zod schemas at every trust boundary (`src/lib/validation.ts`), parsing
`FormData` into typed values before any service sees them. Amounts are parsed
by a dedicated integer parser that rejects anything malformed. Dates are
validated as real calendar dates. Enums are checked against the schema's own
constants, so an unknown status cannot be posted.

Business rules are enforced in the service layer, not the form: spending more
than the balance, confirming more than is outstanding, and illegal status
transitions are all rejected server-side with a plain-language message, and
each has a test that posts the bad value directly.

## Logging

`src/lib/audit.ts` records who did what to which record, and **drops** any
metadata key matching money, code, secret, token, password, hash, balance, text
or note — dropped rather than redacted, so a future field cannot leak by being
added. Values over 120 characters are dropped too.

A failed PDF read logs the library's reason, never the document's contents. No
request logging of record fields.

## Headers

Set globally in `next.config.ts`: `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`,
`Permissions-Policy` disabling camera, microphone, geolocation and payment.

**Not set:** a site-wide Content-Security-Policy. Doing it properly with
Next.js needs per-request nonces, and a loose CSP is worse than an honest
absence. Document responses do carry a strict one.

## Dependencies

Ten runtime dependencies. `npm audit --omit=dev` reports **0 vulnerabilities**.

The development toolchain reports 9 advisories, all in build-time packages
(`drizzle-kit`'s bundled esbuild, and `eslint-config-next`'s transitive
`fast-glob`/`micromatch`/`braces`). None ship to the server or the browser, and
`npm audit fix` would downgrade both to years-old majors — a worse trade. They
are listed here rather than suppressed.

---

## Checklist

| Control | Status |
|---|---|
| Passwords hashed, memory-hard, salted, parameterised | Yes — scrypt |
| Session tokens stored hashed | Yes |
| Session expiry enforced server-side | Yes |
| Password change revokes other sessions | Yes |
| Server-side authorization on every record | Yes |
| Identical response for "not yours" and "missing" | Yes |
| Household isolation, explicit grants only | Yes |
| Viewer role cannot be escalated by a grant | Yes |
| CSRF defence | Yes — origin check, SameSite, POST-only exports |
| Input validated at trust boundaries | Yes — Zod |
| Business rules enforced in services, not forms | Yes |
| Upload type checked by content | Yes |
| Upload path traversal prevented | Yes |
| Private file serving with per-request authorization | Yes |
| Secrets encrypted with authenticated encryption | Yes — AES-256-GCM |
| Secrets excluded from logs, search and exports | Yes |
| Rate limiting on sensitive actions | Yes (in-process) |
| Safe error messages | Yes |
| Audit log without sensitive values | Yes |
| Secrets kept out of version control | Yes — `.env.local` git-ignored, 0600 |
| Runtime dependency audit clean | Yes |
| Security headers | Partial — no site-wide CSP |
| Two-factor authentication | No |
| Independent security assessment | No |

## Before any public launch

1. Commission an independent security assessment and a penetration test.
2. Review obligations under India's Digital Personal Data Protection Act, 2023
   — and any other jurisdiction you serve — with a qualified lawyer. The
   privacy policy and terms in this repository are drafts, not advice.
3. Terminate TLS properly and set HSTS at the proxy.
4. Add a site-wide CSP with nonces.
5. Move rate limiting to a shared store if running more than one instance.
6. Decide on a key-management story: the encryption key currently lives next to
   the data it protects.
7. Add 2FA before holding other people's gift-card codes at any scale.

## Reporting a problem

This is self-hosted software with no vendor behind it. Report an issue
privately to whoever operates your installation, and to wherever you obtained
the code — not in a public thread with reproduction details.
