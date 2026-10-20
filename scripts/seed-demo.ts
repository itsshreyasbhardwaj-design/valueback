/**
 * Creates a self-contained demo account with clearly fictional records.
 *
 *   npm run seed:demo            # create (or top up) the demo accounts
 *   npm run seed:demo -- --reset # delete them first, then recreate
 *
 * The password is generated at random on every run and printed once. Nothing
 * is hardcoded, so there is no shared secret in the repository, and the demo
 * data lives under its own accounts — a real user's dashboard never shows it.
 */
import { eq } from 'drizzle-orm';
import { db } from '../src/lib/db/index.ts';
import { entitlements, userSettings, users } from '../src/lib/db/schema.ts';
import { hashPassword, newToken } from '../src/lib/crypto.ts';
import { newId } from '../src/lib/ids.ts';
import { addDays, todayIso } from '../src/lib/dates.ts';
import { createBenefit, recordBalanceEvent } from '../src/lib/benefits.ts';
import { createRefundCase, transitionRefund } from '../src/lib/refunds.ts';
import { createHousehold, createInvite, acceptInvite, shareRecord } from '../src/lib/household.ts';
import { processDocument, storeDocument } from '../src/lib/documents.ts';
import { runDueReminders } from '../src/lib/reminders.ts';

const DEMO_EMAIL = 'demo@valueback.local';
const PARTNER_EMAIL = 'demo-partner@valueback.local';
const OFFSETS = [30, 14, 7, 3, 1];
const today = todayIso();
const reset = process.argv.includes('--reset');

function makeUser(email: string, name: string, password: string) {
  const existing = db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
  if (existing && reset) db.delete(users).where(eq(users.id, existing.id)).run();
  else if (existing) return { id: existing.id, created: false };

  const id = newId('u_');
  db.transaction((tx) => {
    tx.insert(users)
      .values({ id, email, name, passwordHash: hashPassword(password) })
      .run();
    tx.insert(userSettings)
      .values({
        userId: id,
        currency: 'INR',
        timeZone: 'Asia/Kolkata',
        // The demo exists to show a populated product, not the wizard.
        onboardingStep: 5,
        onboardingCompletedAt: new Date().toISOString(),
      })
      .run();
    tx.insert(entitlements).values({ userId: id, plan: 'free' }).run();
  });
  return { id, created: true };
}

const password = `demo-${newToken(9)}`;
const demo = makeUser(DEMO_EMAIL, 'Demo Example', password);
const partner = makeUser(PARTNER_EMAIL, 'Partner Example', password);

if (!demo.created && !reset) {
  console.log(`${DEMO_EMAIL} already exists. Re-run with --reset to rebuild it from scratch.`);
  process.exit(0);
}

const note = 'FICTIONAL EXAMPLE RECORD — created by npm run seed:demo. Not a real benefit.';

/* ---------------------------------------------------------- benefits --- */

const giftCard = createBenefit({
  userId: demo.id,
  title: 'Example: Bluebird Books gift card',
  category: 'gift_card',
  merchant: 'Bluebird Books',
  currency: 'INR',
  originalValueMinor: 250_000,
  issuedAt: addDays(today, -40),
  receivedAt: addDays(today, -38),
  expiresAt: addDays(today, 21),
  notes: note,
  tags: ['example', 'gift'],
  code: 'BB-DEMO-4432',
  conditions: 'Valid in store and online. Cannot be exchanged for cash.',
  reminderOffsets: OFFSETS,
});
recordBalanceEvent(
  demo.id,
  giftCard,
  {
    type: 'usage',
    amountMinor: 80_000,
    reason: 'Example: spent on a book order',
    occurredAt: addDays(today, -9),
  },
  OFFSETS,
);

const storeCredit = createBenefit({
  userId: demo.id,
  title: 'Example: Lifestyle credit note after a return',
  category: 'store_credit',
  merchant: 'Lifestyle',
  currency: 'INR',
  originalValueMinor: 100_000,
  issuedAt: addDays(today, -55),
  expiresAt: addDays(today, 5),
  notes: note,
  tags: ['example'],
  evidence: 'user_confirmed',
  reminderOffsets: OFFSETS,
});

const classPack = createBenefit({
  userId: demo.id,
  title: 'Example: 10-class yoga pack',
  category: 'prepaid_service',
  merchant: 'Still Point Studio',
  currency: 'INR',
  originalValueMinor: 600_000,
  unitLabel: 'classes',
  originalUnits: 10,
  issuedAt: addDays(today, -70),
  expiresAt: addDays(today, 45),
  notes: note,
  tags: ['example', 'health'],
  reminderOffsets: OFFSETS,
});
recordBalanceEvent(
  demo.id,
  classPack,
  {
    type: 'usage',
    units: 6,
    amountMinor: 360_000,
    reason: 'Example: six classes attended',
    occurredAt: addDays(today, -14),
  },
  OFFSETS,
);

createBenefit({
  userId: demo.id,
  title: 'Example: free dessert voucher',
  category: 'coupon',
  merchant: 'Ananda Kitchen',
  currency: 'INR',
  expiresAt: addDays(today, 60),
  conditions: 'One per table, dine-in only, not valid on public holidays.',
  notes: `${note} Deliberately has no monetary value, to show that an amount is optional.`,
  tags: ['example'],
  reminderOffsets: OFFSETS,
});

createBenefit({
  userId: demo.id,
  title: 'Example: airline credit from a cancelled trip',
  category: 'travel_voucher',
  merchant: 'Marigold Air',
  currency: 'INR',
  originalValueMinor: 1_245_000,
  issuedAt: addDays(today, -200),
  expiresAt: addDays(today, -12), // deliberately past, to show the review prompt
  conditions: 'Usable against one booking in the original passenger name.',
  notes: `${note} Past its recorded expiry on purpose — ValueBack flags it instead of writing it off.`,
  tags: ['example', 'travel'],
  reminderOffsets: OFFSETS,
});

/* ----------------------------------------------------------- refunds --- */

const overdueRefund = createRefundCase({
  userId: demo.id,
  merchant: 'Zentra Electronics',
  orderRef: 'ZE-884512',
  currency: 'INR',
  amountMinor: 379_900,
  purchaseDate: addDays(today, -32),
  initiatedAt: addDays(today, -21),
  expectedByDate: addDays(today, -4), // overdue on purpose
  method: 'Original payment method',
  notes: `${note} The expected window has passed, so it appears under Needs attention.`,
  checkInDays: 7,
});
transitionRefund(demo.id, overdueRefund, 'accepted', {
  note: 'Example: return accepted at the collection point',
  occurredAt: addDays(today, -19),
  checkInDays: 7,
});
const receivedRefund = createRefundCase({
  userId: demo.id,
  merchant: 'Marigold Travel',
  orderRef: 'MT-20491',
  currency: 'INR',
  amountMinor: 645_000,
  purchaseDate: addDays(today, -90),
  initiatedAt: addDays(today, -60),
  expectedByDate: addDays(today, -30),
  method: 'Bank transfer',
  notes: note,
  checkInDays: 7,
});
let rc = transitionRefund(demo.id, receivedRefund, 'initiated', {
  note: 'Example: refund initiated by the agent',
  occurredAt: addDays(today, -45),
  checkInDays: 7,
});
if (rc.ok) {
  rc = transitionRefund(demo.id, rc.refundCase, 'received_confirmed', {
    note: 'Example: confirmed in the bank statement',
    occurredAt: addDays(today, -38),
    checkInDays: 7,
  });
}

const partialRefund = createRefundCase({
  userId: demo.id,
  merchant: 'Harbour Home',
  orderRef: 'HH-5512',
  currency: 'INR',
  amountMinor: 210_000,
  purchaseDate: addDays(today, -25),
  initiatedAt: addDays(today, -12),
  expectedByDate: addDays(today, 6),
  notes: `${note} Shows a partial receipt: only the confirmed part counts as recovered.`,
  checkInDays: 7,
});
let partial = transitionRefund(demo.id, partialRefund, 'initiated', {
  note: 'Example: refund split across two payments',
  occurredAt: addDays(today, -8),
  checkInDays: 7,
});
if (partial.ok) {
  partial = transitionRefund(demo.id, partial.refundCase, 'partially_received', {
    receivedNowMinor: 90_000,
    note: 'Example: first instalment received',
    occurredAt: addDays(today, -3),
    checkInDays: 7,
  });
}

/* --------------------------------------------------------- documents --- */

const receipt = [
  'STILL POINT STUDIO',
  'Tax invoice SP-2291',
  '',
  'Order No: SP-2291',
  'Issued on: ' + addDays(today, -70),
  'Package: pack of 10 classes',
  'Amount: INR 6000.00',
  'Valid till: ' + addDays(today, 45),
  '',
  'Not valid with any other offer. No cash alternative.',
  '',
  'FICTIONAL EXAMPLE DOCUMENT generated by npm run seed:demo.',
].join('\n');

const file = new File([receipt], 'example-studio-invoice.txt', { type: 'text/plain' });
const stored = await storeDocument(demo.id, file, { benefitId: classPack.id });
if (stored.ok) await processDocument(stored.document, 'INR');

/* --------------------------------------------------------- household --- */

const household = createHousehold(demo.id, 'Example Household', 'free');
if (household.ok) {
  const invite = createInvite(demo.id, household.household.id, 'member', 'free');
  if (invite.ok) {
    acceptInvite(partner.id, invite.token);
    shareRecord(demo.id, household.household.id, 'benefit', storeCredit.id, 'view');
    shareRecord(demo.id, household.household.id, 'refund_case', overdueRefund.id, 'edit');
  }
}

const fired = runDueReminders(today);

console.log(`
Demo data created.

  Sign in at  http://localhost:3000/signin
  Account     ${DEMO_EMAIL}
  Partner     ${PARTNER_EMAIL}   (shows the household sharing view)
  Password    ${password}

  This password was generated for this run only and is not stored anywhere else.
  Run the command again with --reset to rebuild with a new one.

  Seeded: 5 benefits (one partially used, one past its recorded expiry, one
  without a monetary value), 3 refund cases (one overdue, one confirmed
  received, one partially received), 1 document read locally, 1 household with
  two members and two shared records.
  ${fired.fired} notification(s) fired from ${fired.scanned} due reminder(s).

  Every record is titled "Example:" and carries a note marking it as fictional.
`);
