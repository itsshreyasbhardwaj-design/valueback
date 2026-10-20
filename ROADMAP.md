# Roadmap

## Phase 1 — functional foundation · Complete

| Deliverable | Status |
|---|---|
| Brand design system | Done — tokenised light/dark palette, reusable components |
| Responsive landing page | Done |
| Authentication | Done — registration, sign in/out, sessions, protected routes |
| Secure user accounts | Done — scrypt hashing, server-side sessions, rate limits |
| Onboarding | Done — six skippable steps, progress persisted |
| Main dashboard | Done — eight separated metrics, six sections, real data only |
| Benefit tracking | Done — ten categories, append-only ledger |
| Gift card management | Done — including encrypted codes |
| Store credit management | Done |
| Refund tracking | Done — RefundWatch with an enforced state machine |
| Prepaid service tracking | Done — unit balances alongside money |
| Membership tracking | Done — including recurring allowances |
| Coupon management | Done — amount optional throughout |
| Document uploads | Done — content-sniffed, private storage |
| Manual entry | Done |
| Basic text extraction | Done — PDF, text, `.eml`, and images with local OCR |
| Expiry tracking | Done — never auto-expires a record |
| In-app reminders | Done — notification centre with persistent unread state |
| User profile | Done |
| Settings | Done — three sections |
| Search | Done |
| Categories and filtering | Done |
| Benefit history | Done — the ledger, never overwritten |
| Verified recovery tracking | Done — only user-confirmed outcomes count |
| Basic value analytics | Done |

## Phase 2 — intelligent organisation · Complete

| Deliverable | Status |
|---|---|
| Improved document scanning | Done — PDF text layer, OCR, `.eml`, per-page limits |
| Rule-based classification | Done — weighted rules, declines to guess below a threshold |
| Structured extraction | Done — ten field types with confidence and evidence |
| Extraction review and correction | Done — nothing saved without acceptance |
| Duplicate detection | Done — suggestions only, owner-scoped |
| Recovery confidence indicators | Done — evidence categories, no invented percentages |
| Advanced recovery dashboard | Done — ranked attention with plain-language reasons |
| Benefit priority ranking | Done — deterministic, transparent |
| Claim and refund timelines | Done — with actor and date |
| Suggested follow-up actions | Done |
| Local support-message drafts | Done — factual, copy to clipboard |
| EML import | Done |
| Shared family spaces | Done — per-record grants, roles, expiring hashed invitations |
| Recurring prepaid tracking | Done — idempotent per period |
| Notification preferences | Done |
| Browser notifications | Done where the platform allows — nothing once the app is closed |
| Data export and import | Done — CSV, JSON, `.tar.gz`, validated import |
| Improved search | Done — saved views deliberately cut |
| Complete responsive design | Done — verified at phone width end-to-end |
| Accessibility improvements | Done — no formal audit claimed |
| Comprehensive automated testing | Done — 232 unit/integration, 32 end-to-end |

Two Phase 2 items carry a documented asterisk: **browser notifications** cannot
reach a closed app without a push service, and **saved views** were cut as the
directive's one optional item. Both are stated in the interface and in
[FEATURES.md](FEATURES.md).

---

## Phase 3 — deferred integrations

Nothing below is started, and none of it is needed to run what exists. Each
entry notes what it would touch, because the current code was shaped to make
these mechanical rather than invasive.

### Managed PostgreSQL
SQLite is one file on one machine; a stateless deployment needs a real server.
Drizzle already abstracts the queries, ids are opaque text, instants are ISO
strings and money is integers — all chosen to port unchanged. *Touches:*
`src/lib/db/index.ts`, the dialect import in the schema, and regenerating the
migrations. Raw SQL appears only in two `IN (...)` subqueries in `authz.ts`,
both standard.

### Cloud object storage
*Touches:* four functions in `src/lib/documents.ts` (`storageDir`,
`storeDocument`, `readDocumentBytes`, `deleteDocument`) and the file route,
which would issue a signed URL instead of streaming bytes.

### Transactional email
Unlocks email verification, password reset, invitations that send themselves,
and sending a follow-up rather than copying it. *Touches:* a new sender module;
`buildFollowUpDraft` already returns a subject and body. Recovery codes stay as
the offline fallback.

### Google sign-in and Gmail import
Sign-in needs an OAuth client and a provider column on `users`. Gmail import is
the interesting one: the `.eml` parser and the whole extraction pipeline
already work, so an import would feed existing code. It needs restricted-scope
verification from Google and a clear consent story.

### Payment processing
*Touches:* `src/lib/entitlements.ts`, where limits already live and are already
enforced server-side, plus a webhook that writes the plan. The dev-only
override would be removed. Pricing is provisional and would need review.

### Production push notifications
Web Push with VAPID keys and a service worker, or a mobile app. The reminder
engine already writes notification rows with a dedupe key, so a sender reads
unsent rows. Only then can the app honestly promise delivery.

### Official merchant and loyalty APIs
The only route to a genuine "Provider verified" badge, which exists in the data
model and is deliberately unreachable. Each integration is a separate
commercial agreement; the evidence model already has the slot.

### Optional language-model API
Current extraction is deterministic parsing and is described as such. A model
could improve messy scans. It must stay optional, must never be required, and
must never receive a redemption code — the extraction interface already
separates sensitive fields so they can be withheld.

### Mobile applications
The web app is responsive and tested at phone width. A native app is only worth
it for push, camera capture and offline access.

---

## Smaller things worth doing first

Ordered by value, independent of Phase 3:

1. **Two-factor authentication.** The most valuable security addition for an
   app holding bearer codes.
2. **A site-wide Content-Security-Policy** with per-request nonces.
3. **Saved views** — the filters are already URL-based, so this is persistence
   and a menu.
4. **Bulk actions** — archiving twenty expired coupons one at a time is tedious.
5. **Key rotation for redemption codes**, with a re-encryption routine.
6. **Changing your email address**, which needs a verification step and
   therefore email.
7. **A real accessibility audit** with a screen reader, rather than the care
   taken so far.
8. **Measured performance budgets** on representative data, rather than the
   current "no numbers claimed".
