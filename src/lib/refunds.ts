import 'server-only';
import { and, asc, count, desc, eq, inArray, isNull, isNotNull, lte, sql } from 'drizzle-orm';
import { db } from './db';
import {
  claimActions,
  recoveryEvents,
  refundCases,
  refundEvents,
  type ClaimActionKind,
  type RefundStatus,
} from './db/schema';
import { nowIso, todayIso, formatDate } from './dates';
import { newId } from './ids';
import { formatMoney, minorToDecimalString } from './money';
import { syncRefundCheckIn } from './reminders';
import { audit } from './audit';
import { visibleRefundWhere } from './authz';

export type RefundCase = typeof refundCases.$inferSelect;
export type RefundEvent = typeof refundEvents.$inferSelect;

/** Legal moves in the refund state machine. Anything else is rejected server-side. */
export const REFUND_TRANSITIONS: Record<RefundStatus, RefundStatus[]> = {
  requested: ['accepted', 'initiated', 'disputed', 'closed_without_receipt'],
  accepted: ['initiated', 'awaiting_receipt', 'disputed', 'closed_without_receipt'],
  initiated: ['awaiting_receipt', 'partially_received', 'received_confirmed', 'disputed'],
  awaiting_receipt: ['partially_received', 'received_confirmed', 'disputed', 'closed_without_receipt'],
  partially_received: ['received_confirmed', 'partially_received', 'disputed', 'closed_without_receipt'],
  received_confirmed: ['disputed'],
  disputed: ['accepted', 'initiated', 'awaiting_receipt', 'partially_received', 'received_confirmed', 'closed_without_receipt'],
  closed_without_receipt: ['disputed', 'requested'],
};

export const OPEN_REFUND_STATUSES: RefundStatus[] = [
  'requested', 'accepted', 'initiated', 'awaiting_receipt', 'partially_received', 'disputed',
];

export function refundStatusLabel(s: RefundStatus): string {
  return {
    requested: 'Return or cancellation requested',
    accepted: 'Request accepted by merchant',
    initiated: 'Refund initiated',
    awaiting_receipt: 'Awaiting receipt',
    received_confirmed: 'Received and confirmed',
    partially_received: 'Partially received',
    disputed: 'Disputed',
    closed_without_receipt: 'Closed without receipt',
  }[s];
}

export function canTransitionRefund(from: RefundStatus, to: RefundStatus): boolean {
  return REFUND_TRANSITIONS[from].includes(to);
}

export type CreateRefundInput = {
  userId: string;
  merchant: string;
  orderRef?: string;
  referenceNumber?: string;
  currency: string;
  amountMinor: number;
  purchaseDate?: string | null;
  initiatedAt?: string | null;
  expectedByDate?: string | null;
  method?: string;
  notes?: string;
  checkInDays: number;
  documentId?: string | null;
};

export function createRefundCase(input: CreateRefundInput): RefundCase {
  const id = newId('rc_');
  const today = todayIso();
  db.transaction((tx) => {
    tx.insert(refundCases)
      .values({
        id,
        userId: input.userId,
        merchant: input.merchant.trim(),
        orderRef: (input.orderRef ?? '').trim(),
        referenceNumber: (input.referenceNumber ?? '').trim(),
        currency: input.currency.toUpperCase(),
        amountMinor: input.amountMinor,
        purchaseDate: input.purchaseDate ?? null,
        initiatedAt: input.initiatedAt ?? null,
        expectedByDate: input.expectedByDate ?? null,
        method: (input.method ?? '').trim(),
        notes: input.notes ?? '',
        status: 'requested',
      })
      .run();
    tx.insert(refundEvents)
      .values({
        id: newId('re_'),
        refundCaseId: id,
        actorUserId: input.userId,
        fromStatus: null,
        toStatus: 'requested',
        note: 'Case opened',
        documentId: input.documentId ?? null,
        occurredAt: input.initiatedAt ?? today,
      })
      .run();
  });
  const created = db.select().from(refundCases).where(eq(refundCases.id, id)).get()!;
  syncRefundCheckIn(input.userId, created, input.checkInDays, today);
  audit(input.userId, 'refund.create', 'refund_case', id, { merchant: input.merchant.slice(0, 60) });
  return created;
}

export type TransitionResult = { ok: true; refundCase: RefundCase } | { ok: false; error: string };

/**
 * Move a case through the state machine, recording who did it and when.
 *
 * Money is only ever counted as recovered here, and only for the *increment*
 * the user confirms receiving — so partially_received -> received_confirmed
 * cannot count the same rupee twice.
 */
export function transitionRefund(
  actorUserId: string,
  rc: RefundCase,
  to: RefundStatus,
  opts: {
    receivedNowMinor?: number | null;
    note?: string;
    occurredAt?: string;
    documentId?: string | null;
    closedReason?: string;
    checkInDays: number;
  },
): TransitionResult {
  if (!canTransitionRefund(rc.status, to)) {
    return {
      ok: false,
      error: `"${refundStatusLabel(rc.status)}" cannot move to "${refundStatusLabel(to)}".`,
    };
  }
  const occurredAt = opts.occurredAt ?? todayIso();
  const set: Partial<typeof refundCases.$inferInsert> = { status: to, updatedAt: nowIso() };
  let increment = 0;

  if (to === 'received_confirmed' || to === 'partially_received') {
    const remaining = rc.amountMinor - rc.receivedAmountMinor;
    const amount =
      opts.receivedNowMinor != null && opts.receivedNowMinor > 0
        ? opts.receivedNowMinor
        : to === 'received_confirmed'
          ? remaining
          : 0;
    if (amount <= 0) {
      return { ok: false, error: 'Enter the amount you actually received.' };
    }
    if (amount > remaining) {
      return {
        ok: false,
        error: `That is more than the ${formatMoney(remaining, rc.currency)} still outstanding on this case.`,
      };
    }
    increment = amount;
    set.receivedAmountMinor = rc.receivedAmountMinor + amount;
    if (to === 'received_confirmed') set.confirmedAt = nowIso();
  }
  if (to === 'closed_without_receipt') set.closedReason = (opts.closedReason ?? '').slice(0, 300);

  db.transaction((tx) => {
    tx.update(refundCases).set(set).where(eq(refundCases.id, rc.id)).run();
    tx.insert(refundEvents)
      .values({
        id: newId('re_'),
        refundCaseId: rc.id,
        actorUserId,
        fromStatus: rc.status,
        toStatus: to,
        amountMinor: increment || null,
        note: (opts.note ?? '').slice(0, 500),
        documentId: opts.documentId ?? null,
        occurredAt,
      })
      .run();
    if (increment > 0) {
      tx.insert(recoveryEvents)
        .values({
          id: newId('rv_'),
          userId: rc.userId,
          kind: 'refund_received',
          refundCaseId: rc.id,
          currency: rc.currency,
          amountMinor: increment,
          note: `Confirmed received from ${rc.merchant}`,
          occurredAt,
        })
        .run();
    }
  });

  const updated = db.select().from(refundCases).where(eq(refundCases.id, rc.id)).get()!;
  syncRefundCheckIn(updated.userId, updated, opts.checkInDays);
  audit(actorUserId, 'refund.transition', 'refund_case', rc.id, { from: rc.status, to });
  return { ok: true, refundCase: updated };
}

export function updateRefundDetails(
  actorUserId: string,
  rc: RefundCase,
  patch: Partial<Pick<RefundCase, 'merchant' | 'orderRef' | 'referenceNumber' | 'purchaseDate' | 'initiatedAt' | 'expectedByDate' | 'method' | 'notes' | 'amountMinor'>>,
  checkInDays: number,
): TransitionResult {
  if (patch.amountMinor != null) {
    if (patch.amountMinor <= 0) return { ok: false, error: 'The expected amount must be greater than zero.' };
    if (patch.amountMinor < rc.receivedAmountMinor) {
      return { ok: false, error: 'The expected amount cannot be less than what you have already confirmed receiving.' };
    }
  }
  db.update(refundCases).set({ ...patch, updatedAt: nowIso() }).where(eq(refundCases.id, rc.id)).run();
  const updated = db.select().from(refundCases).where(eq(refundCases.id, rc.id)).get()!;
  syncRefundCheckIn(updated.userId, updated, checkInDays);
  audit(actorUserId, 'refund.update', 'refund_case', rc.id, {});
  return { ok: true, refundCase: updated };
}

export function archiveRefundCase(actorUserId: string, rc: RefundCase, archived: boolean) {
  db.update(refundCases)
    .set({ archivedAt: archived ? nowIso() : null, updatedAt: nowIso() })
    .where(eq(refundCases.id, rc.id))
    .run();
  audit(actorUserId, archived ? 'refund.archive' : 'refund.unarchive', 'refund_case', rc.id, {});
}

export function refundTimeline(caseId: string): RefundEvent[] {
  return db
    .select()
    .from(refundEvents)
    .where(eq(refundEvents.refundCaseId, caseId))
    .orderBy(desc(refundEvents.createdAt))
    .all();
}

/* -------------------------------------------------------- claim actions */

export function addClaimAction(input: {
  userId: string;
  refundCaseId?: string | null;
  benefitId?: string | null;
  kind: ClaimActionKind;
  summary: string;
  assigneeUserId?: string | null;
  dueAt?: string | null;
}) {
  const id = newId('ca_');
  db.insert(claimActions)
    .values({
      id,
      userId: input.userId,
      refundCaseId: input.refundCaseId ?? null,
      benefitId: input.benefitId ?? null,
      kind: input.kind,
      summary: input.summary.slice(0, 500),
      assigneeUserId: input.assigneeUserId ?? null,
      dueAt: input.dueAt ?? null,
    })
    .run();
  return id;
}

export function completeClaimAction(userId: string, id: string) {
  db.update(claimActions)
    .set({ completedAt: nowIso() })
    .where(and(eq(claimActions.id, id), eq(claimActions.userId, userId)))
    .run();
}

export function claimActionsFor(refundCaseId: string) {
  return db
    .select()
    .from(claimActions)
    .where(eq(claimActions.refundCaseId, refundCaseId))
    .orderBy(desc(claimActions.createdAt))
    .all();
}

/* -------------------------------------------------- follow-up drafting */

/**
 * Builds a polite follow-up message from the facts already recorded on the case.
 * Deliberately factual: it never asserts that the merchant accepted the claim,
 * broke a law, or issued money. ValueBack cannot send it — the UI offers copy
 * to clipboard, because no email provider is configured.
 */
export function buildFollowUpDraft(
  rc: RefundCase,
  userName: string,
  dateFormat: 'dd/MM/yyyy' | 'MM/dd/yyyy' | 'yyyy-MM-dd' = 'dd/MM/yyyy',
): { subject: string; body: string } {
  const amount = `${rc.currency} ${minorToDecimalString(rc.amountMinor, rc.currency)}`;
  const facts: string[] = [];
  if (rc.orderRef) facts.push(`Order reference: ${rc.orderRef}`);
  if (rc.referenceNumber) facts.push(`Refund reference: ${rc.referenceNumber}`);
  if (rc.purchaseDate) facts.push(`Purchase date: ${formatDate(rc.purchaseDate, dateFormat)}`);
  if (rc.initiatedAt) facts.push(`Return or cancellation raised: ${formatDate(rc.initiatedAt, dateFormat)}`);
  if (rc.expectedByDate) facts.push(`Refund window I was given: by ${formatDate(rc.expectedByDate, dateFormat)}`);
  if (rc.method) facts.push(`Expected refund method: ${rc.method}`);
  if (rc.receivedAmountMinor > 0) {
    facts.push(
      `Amount received so far: ${rc.currency} ${minorToDecimalString(rc.receivedAmountMinor, rc.currency)}`,
    );
  }

  const outstanding = rc.amountMinor - rc.receivedAmountMinor;
  const ask =
    rc.receivedAmountMinor > 0
      ? `I have received part of the amount. ${rc.currency} ${minorToDecimalString(outstanding, rc.currency)} still appears to be outstanding.`
      : `As of today I have not seen the amount credited back to me.`;

  const subject = rc.orderRef
    ? `Refund status for order ${rc.orderRef}`
    : `Refund status for a ${amount} return`;

  const body = [
    `Hello ${rc.merchant} support team,`,
    ``,
    `I am following up on a refund of ${amount}. ${ask} I would like to understand where it currently stands.`,
    ``,
    `Details on my side:`,
    ...facts.map((f) => `  • ${f}`),
    ``,
    `Could you confirm whether the refund has been processed, and if so, the date and reference it was sent with? If anything further is needed from me, please let me know and I will provide it.`,
    ``,
    `Thank you for your help.`,
    ``,
    userName || 'ValueBack user',
  ].join('\n');

  return { subject, body };
}

/* -------------------------------------------------------------- queries */

export type RefundFilters = {
  q?: string;
  statuses?: RefundStatus[];
  includeArchived?: boolean;
  onlyOpen?: boolean;
  sort?: 'updated' | 'expected' | 'amount';
  page?: number;
  pageSize?: number;
};

export function listRefundCases(userId: string, f: RefundFilters = {}) {
  const where = [visibleRefundWhere(userId)];
  if (!f.includeArchived) where.push(isNull(refundCases.archivedAt));
  if (f.onlyOpen) where.push(inArray(refundCases.status, OPEN_REFUND_STATUSES));
  if (f.statuses?.length) where.push(inArray(refundCases.status, f.statuses));
  if (f.q) {
    const term = `%${f.q.toLowerCase()}%`;
    where.push(
      sql`(lower(${refundCases.merchant}) LIKE ${term} OR lower(${refundCases.orderRef}) LIKE ${term}
           OR lower(${refundCases.referenceNumber}) LIKE ${term} OR lower(${refundCases.notes}) LIKE ${term})`,
    );
  }
  const order =
    f.sort === 'expected'
      ? [sql`${refundCases.expectedByDate} IS NULL`, asc(refundCases.expectedByDate)]
      : f.sort === 'amount'
        ? [desc(refundCases.amountMinor)]
        : [desc(refundCases.updatedAt)];

  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, f.pageSize ?? 20));
  const rows = db
    .select()
    .from(refundCases)
    .where(and(...where))
    .orderBy(...order)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();
  const total = db.select({ n: count() }).from(refundCases).where(and(...where)).get()?.n ?? 0;
  return { rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Cases whose promised window has passed and that are still open. */
export function overdueRefunds(userId: string, today = todayIso()) {
  return db
    .select()
    .from(refundCases)
    .where(
      and(
        visibleRefundWhere(userId),
        isNull(refundCases.archivedAt),
        inArray(refundCases.status, OPEN_REFUND_STATUSES),
        isNotNull(refundCases.expectedByDate),
        lte(refundCases.expectedByDate, today),
      ),
    )
    .orderBy(asc(refundCases.expectedByDate))
    .all();
}
