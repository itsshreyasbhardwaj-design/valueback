import 'server-only';
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { db } from './db';
import {
  balanceEvents,
  benefits,
  recoveryEvents,
  type BalanceEventType,
  type BenefitCategory,
  type BenefitStatus,
  type EvidenceLevel,
} from './db/schema';
import { addDays, daysBetween, nowIso, todayIso } from './dates';
import { newId } from './ids';
import { codeHint, encryptSecret } from './crypto';
import { syncExpiryReminders } from './reminders';
import { audit } from './audit';
import { visibleBenefitWhere } from './authz';

export type Benefit = typeof benefits.$inferSelect;
export type BalanceEvent = typeof balanceEvents.$inferSelect;

/** Statuses a record may move to by explicit user action. */
export const BENEFIT_TRANSITIONS: Record<BenefitStatus, BenefitStatus[]> = {
  unverified: ['available', 'expired_per_terms', 'invalid', 'archived'],
  available: ['partially_used', 'redeemed', 'expired_per_terms', 'invalid', 'archived'],
  partially_used: ['redeemed', 'expired_per_terms', 'invalid', 'archived'],
  redeemed: ['available', 'archived'],
  expired_per_terms: ['available', 'invalid', 'archived'],
  invalid: ['unverified', 'available', 'archived'],
  archived: ['unverified', 'available', 'partially_used'],
};

export function canTransition(from: BenefitStatus, to: BenefitStatus): boolean {
  return BENEFIT_TRANSITIONS[from].includes(to);
}

/** Statuses that still represent value the user might use. */
export const OUTSTANDING_STATUSES: BenefitStatus[] = ['unverified', 'available', 'partially_used'];

/**
 * A recorded expiry date in the past NEVER changes the status by itself: the
 * underlying right may survive it. It only raises a flag in the UI.
 */
export function isPastRecordedExpiry(b: Pick<Benefit, 'expiresAt' | 'status'>, today = todayIso()) {
  return Boolean(
    b.expiresAt && daysBetween(today, b.expiresAt) < 0 && OUTSTANDING_STATUSES.includes(b.status),
  );
}

export type CreateBenefitInput = {
  userId: string;
  title: string;
  category: BenefitCategory;
  merchant?: string;
  currency: string;
  originalValueMinor?: number | null;
  currentValueMinor?: number | null;
  unitLabel?: string | null;
  originalUnits?: number | null;
  issuedAt?: string | null;
  receivedAt?: string | null;
  expiresAt?: string | null;
  conditions?: string;
  notes?: string;
  tags?: string[];
  code?: string | null;
  recurrence?: 'none' | 'monthly' | 'quarterly' | 'yearly';
  recurrenceUnits?: number | null;
  recurrenceAnchor?: string | null;
  evidence?: EvidenceLevel;
  reminderOffsets: number[];
  documentId?: string | null;
};

export function createBenefit(input: CreateBenefitInput): Benefit {
  const id = newId('b_');
  const today = todayIso();
  const value = input.currentValueMinor ?? input.originalValueMinor ?? null;
  const units = input.originalUnits ?? null;

  const row: typeof benefits.$inferInsert = {
    id,
    userId: input.userId,
    title: input.title.trim(),
    category: input.category,
    merchant: (input.merchant ?? '').trim(),
    currency: input.currency.toUpperCase(),
    originalValueMinor: input.originalValueMinor ?? null,
    currentValueMinor: value,
    unitLabel: input.unitLabel?.trim() || null,
    originalUnits: units,
    currentUnits: units,
    status: 'unverified',
    evidence: input.evidence ?? 'user_entered',
    issuedAt: input.issuedAt ?? null,
    receivedAt: input.receivedAt ?? null,
    expiresAt: input.expiresAt ?? null,
    conditions: input.conditions ?? '',
    notes: input.notes ?? '',
    tags: JSON.stringify(input.tags ?? []),
    codeCipher: input.code ? encryptSecret(input.code) : null,
    codeHint: input.code ? codeHint(input.code) : null,
    recurrence: input.recurrence ?? 'none',
    recurrenceUnits: input.recurrenceUnits ?? null,
    recurrenceAnchor: input.recurrenceAnchor ?? null,
  };

  db.transaction((tx) => {
    tx.insert(benefits).values(row).run();
    if (value != null || units != null) {
      tx.insert(balanceEvents)
        .values({
          id: newId('be_'),
          benefitId: id,
          actorUserId: input.userId,
          type: 'initial',
          deltaMinor: value ?? null,
          deltaUnits: units ?? null,
          resultingValueMinor: value ?? null,
          resultingUnits: units ?? null,
          reason: 'Opening balance as recorded by the user',
          documentId: input.documentId ?? null,
          occurredAt: input.receivedAt ?? input.issuedAt ?? today,
        })
        .run();
    }
  });

  const created = db.select().from(benefits).where(eq(benefits.id, id)).get()!;
  syncExpiryReminders(input.userId, created, input.reminderOffsets, today);
  audit(input.userId, 'benefit.create', 'benefit', id, { category: input.category });
  return created;
}

export type UpdateBenefitInput = Partial<
  Pick<
    Benefit,
    | 'title'
    | 'category'
    | 'merchant'
    | 'unitLabel'
    | 'issuedAt'
    | 'receivedAt'
    | 'expiresAt'
    | 'conditions'
    | 'notes'
    | 'recurrence'
    | 'recurrenceUnits'
    | 'recurrenceAnchor'
  >
> & { tags?: string[]; code?: string | null; clearCode?: boolean };

/**
 * Edits descriptive fields only. Monetary balances can change *only* through
 * recordBalanceEvent, so the ledger always explains the current number.
 */
export function updateBenefit(
  userId: string,
  benefit: Benefit,
  patch: UpdateBenefitInput,
  reminderOffsets: number[],
): Benefit {
  const set: Partial<typeof benefits.$inferInsert> = { updatedAt: nowIso() };
  for (const k of [
    'title',
    'category',
    'merchant',
    'unitLabel',
    'issuedAt',
    'receivedAt',
    'expiresAt',
    'conditions',
    'notes',
    'recurrence',
    'recurrenceUnits',
    'recurrenceAnchor',
  ] as const) {
    if (patch[k] !== undefined) (set as Record<string, unknown>)[k] = patch[k];
  }
  if (patch.tags !== undefined) set.tags = JSON.stringify(patch.tags);
  if (patch.clearCode) {
    set.codeCipher = null;
    set.codeHint = null;
  } else if (patch.code) {
    set.codeCipher = encryptSecret(patch.code);
    set.codeHint = codeHint(patch.code);
  }

  db.update(benefits).set(set).where(eq(benefits.id, benefit.id)).run();
  const updated = db.select().from(benefits).where(eq(benefits.id, benefit.id)).get()!;
  if (patch.expiresAt !== undefined) {
    syncExpiryReminders(updated.userId, updated, reminderOffsets);
  }
  audit(userId, 'benefit.update', 'benefit', benefit.id, { fields: Object.keys(set).join(',') });
  return updated;
}

export type BalanceChange =
  | {
      type: 'usage';
      amountMinor?: number | null;
      units?: number | null;
      reason: string;
      occurredAt: string;
      documentId?: string | null;
    }
  | {
      type: 'correction' | 'verified_update';
      newValueMinor?: number | null;
      newUnits?: number | null;
      reason: string;
      occurredAt: string;
      documentId?: string | null;
    }
  | { type: 'redeemed'; reason: string; occurredAt: string; documentId?: string | null }
  | { type: 'revalidation'; newExpiresAt: string | null; reason: string; occurredAt: string };

export type BalanceResult = { ok: true; benefit: Benefit } | { ok: false; error: string };

/**
 * The only writer of benefit balances. Appends to the ledger, refreshes the
 * cached current balance, derives the new status, and — for real consumption
 * only — appends a recovery event. Correction and verified_update deliberately
 * do NOT create recovery events: an unexplained drop is not proof the user got
 * the value, and counting it would inflate "recovered".
 */
export function recordBalanceEvent(
  userId: string,
  benefit: Benefit,
  change: BalanceChange,
  reminderOffsets: number[],
): BalanceResult {
  const cur = benefit.currentValueMinor;
  const curUnits = benefit.currentUnits;
  let nextValue = cur;
  let nextUnits = curUnits;
  let deltaMinor: number | null = null;
  let deltaUnits: number | null = null;
  let nextStatus: BenefitStatus = benefit.status;
  let nextEvidence: EvidenceLevel = benefit.evidence;
  let verifiedAt = benefit.verifiedAt;
  let expiresAt = benefit.expiresAt;
  let recovery: { amountMinor?: number; units?: number } | null = null;

  switch (change.type) {
    case 'usage': {
      const amt = change.amountMinor ?? null;
      const u = change.units ?? null;
      if (amt == null && u == null)
        return { ok: false, error: 'Enter an amount or a number of units.' };
      if (amt != null) {
        if (amt <= 0) return { ok: false, error: 'Usage must be greater than zero.' };
        if (cur == null)
          return { ok: false, error: 'This record has no monetary balance to reduce.' };
        if (amt > cur) return { ok: false, error: 'That is more than the remaining balance.' };
        nextValue = cur - amt;
        deltaMinor = -amt;
      }
      if (u != null) {
        if (u <= 0) return { ok: false, error: 'Units used must be greater than zero.' };
        if (curUnits == null) return { ok: false, error: 'This record does not track units.' };
        if (u > curUnits) return { ok: false, error: 'That is more than the remaining units.' };
        nextUnits = curUnits - u;
        deltaUnits = -u;
      }
      recovery = { amountMinor: amt ?? undefined, units: u ?? undefined };
      const exhausted =
        (nextValue == null || nextValue === 0) && (nextUnits == null || nextUnits === 0);
      nextStatus = exhausted ? 'redeemed' : 'partially_used';
      break;
    }
    case 'redeemed': {
      if ((cur == null || cur === 0) && (curUnits == null || curUnits === 0)) {
        return { ok: false, error: 'Nothing is left to redeem on this record.' };
      }
      if (cur != null && cur > 0) {
        deltaMinor = -cur;
        nextValue = 0;
        recovery = { ...(recovery ?? {}), amountMinor: cur };
      }
      if (curUnits != null && curUnits > 0) {
        deltaUnits = -curUnits;
        nextUnits = 0;
        recovery = { ...(recovery ?? {}), units: curUnits };
      }
      nextStatus = 'redeemed';
      break;
    }
    case 'correction':
    case 'verified_update': {
      const nv = change.newValueMinor;
      const nu = change.newUnits;
      if (nv === undefined && nu === undefined)
        return { ok: false, error: 'Enter the corrected balance.' };
      if (nv !== undefined && nv !== null) {
        if (nv < 0) return { ok: false, error: 'A balance cannot be negative.' };
        nextValue = nv;
        deltaMinor = nv - (cur ?? 0);
      }
      if (nu !== undefined && nu !== null) {
        if (nu < 0) return { ok: false, error: 'Units cannot be negative.' };
        nextUnits = nu;
        deltaUnits = nu - (curUnits ?? 0);
      }
      const empty =
        (nextValue == null || nextValue === 0) && (nextUnits == null || nextUnits === 0);
      if (change.type === 'verified_update') {
        verifiedAt = change.occurredAt;
        nextEvidence = 'reverified';
      } else {
        nextEvidence = benefit.evidence === 'reverified' ? 'reverified' : 'user_confirmed';
      }
      nextStatus = empty
        ? 'redeemed'
        : benefit.status === 'redeemed' ||
            benefit.status === 'expired_per_terms' ||
            benefit.status === 'unverified'
          ? 'available'
          : benefit.status;
      break;
    }
    case 'revalidation': {
      expiresAt = change.newExpiresAt;
      nextStatus = benefit.status === 'expired_per_terms' ? 'available' : benefit.status;
      nextEvidence = 'reverified';
      verifiedAt = change.occurredAt;
      break;
    }
  }

  db.transaction((tx) => {
    tx.insert(balanceEvents)
      .values({
        id: newId('be_'),
        benefitId: benefit.id,
        actorUserId: userId,
        type: change.type as BalanceEventType,
        deltaMinor,
        deltaUnits,
        resultingValueMinor: nextValue ?? null,
        resultingUnits: nextUnits ?? null,
        reason: change.reason.slice(0, 500),
        documentId: 'documentId' in change ? (change.documentId ?? null) : null,
        occurredAt: change.occurredAt,
      })
      .run();

    tx.update(benefits)
      .set({
        currentValueMinor: nextValue ?? null,
        currentUnits: nextUnits ?? null,
        status: nextStatus,
        evidence: nextEvidence,
        verifiedAt,
        expiresAt,
        updatedAt: nowIso(),
      })
      .where(eq(benefits.id, benefit.id))
      .run();

    if (recovery && (recovery.amountMinor || recovery.units)) {
      tx.insert(recoveryEvents)
        .values({
          id: newId('rv_'),
          userId: benefit.userId,
          kind: recovery.amountMinor ? 'credit_redeemed' : 'units_consumed',
          benefitId: benefit.id,
          currency: benefit.currency,
          amountMinor: recovery.amountMinor ?? null,
          units: recovery.units ?? null,
          note: change.reason.slice(0, 200),
          occurredAt: change.occurredAt,
        })
        .run();
      // Units consumed alongside money get their own row so neither metric hides.
      if (recovery.amountMinor && recovery.units) {
        tx.insert(recoveryEvents)
          .values({
            id: newId('rv_'),
            userId: benefit.userId,
            kind: 'units_consumed',
            benefitId: benefit.id,
            currency: benefit.currency,
            units: recovery.units,
            note: change.reason.slice(0, 200),
            occurredAt: change.occurredAt,
          })
          .run();
      }
    }
  });

  const updated = db.select().from(benefits).where(eq(benefits.id, benefit.id)).get()!;
  if (change.type === 'revalidation' || nextStatus !== benefit.status) {
    syncExpiryReminders(updated.userId, updated, reminderOffsets);
  }
  audit(userId, `benefit.balance.${change.type}`, 'benefit', benefit.id, { status: nextStatus });
  return { ok: true, benefit: updated };
}

export function setBenefitStatus(
  userId: string,
  benefit: Benefit,
  to: BenefitStatus,
  reminderOffsets: number[],
): BalanceResult {
  if (!canTransition(benefit.status, to)) {
    return { ok: false, error: `A ${label(benefit.status)} record cannot move to ${label(to)}.` };
  }
  const set: Partial<typeof benefits.$inferInsert> = { status: to, updatedAt: nowIso() };
  if (to === 'available' && benefit.status === 'unverified') {
    set.evidence = 'user_confirmed';
    set.verifiedAt = todayIso();
  }
  if (to === 'archived') set.archivedAt = nowIso();
  if (benefit.status === 'archived' && to !== 'archived') set.archivedAt = null;

  db.update(benefits).set(set).where(eq(benefits.id, benefit.id)).run();
  const updated = db.select().from(benefits).where(eq(benefits.id, benefit.id)).get()!;
  syncExpiryReminders(updated.userId, updated, reminderOffsets);
  audit(userId, 'benefit.status', 'benefit', benefit.id, { from: benefit.status, to });
  return { ok: true, benefit: updated };
}

export function label(s: BenefitStatus): string {
  return {
    unverified: 'Unverified',
    available: 'Available',
    partially_used: 'Partially used',
    redeemed: 'Redeemed',
    expired_per_terms: 'Expired per recorded terms',
    invalid: 'Invalid',
    archived: 'Archived',
  }[s];
}

export function benefitHistory(benefitId: string): BalanceEvent[] {
  return db
    .select()
    .from(balanceEvents)
    .where(eq(balanceEvents.benefitId, benefitId))
    .orderBy(desc(balanceEvents.createdAt))
    .all();
}

/** Ledger truth, used by tests and by the integrity check in the settings page. */
export function recomputeBalanceFromLedger(benefitId: string): {
  value: number | null;
  units: number | null;
} {
  const rows = db
    .select()
    .from(balanceEvents)
    .where(eq(balanceEvents.benefitId, benefitId))
    .orderBy(asc(balanceEvents.createdAt))
    .all();
  let value: number | null = null;
  let units: number | null = null;
  for (const r of rows) {
    if (r.deltaMinor != null) value = (value ?? 0) + r.deltaMinor;
    if (r.deltaUnits != null) units = (units ?? 0) + r.deltaUnits;
  }
  return { value, units };
}

/* ------------------------------------------------------------- querying */

export type BenefitFilters = {
  q?: string;
  categories?: BenefitCategory[];
  statuses?: BenefitStatus[];
  merchant?: string;
  expiringWithinDays?: number;
  includeArchived?: boolean;
  onlyArchived?: boolean;
  from?: string;
  to?: string;
  sort?: 'updated' | 'expiry' | 'value' | 'title';
  page?: number;
  pageSize?: number;
};

export function listBenefits(userId: string, f: BenefitFilters = {}) {
  const today = todayIso();
  const where = [visibleBenefitWhere(userId)];

  if (f.onlyArchived) where.push(isNotNull(benefits.archivedAt));
  else if (!f.includeArchived) where.push(isNull(benefits.archivedAt));

  if (f.categories?.length) where.push(inArray(benefits.category, f.categories));
  if (f.statuses?.length) where.push(inArray(benefits.status, f.statuses));
  if (f.merchant) where.push(eq(benefits.merchant, f.merchant));
  if (f.expiringWithinDays != null) {
    where.push(isNotNull(benefits.expiresAt));
    where.push(gte(benefits.expiresAt, today));
    where.push(lte(benefits.expiresAt, addDays(today, f.expiringWithinDays)));
    where.push(inArray(benefits.status, OUTSTANDING_STATUSES));
  }
  if (f.from) where.push(gte(benefits.createdAt, f.from));
  if (f.to) where.push(lte(benefits.createdAt, `${f.to}T23:59:59.999Z`));
  if (f.q) {
    const term = `%${f.q.toLowerCase()}%`;
    // Redemption codes are stored encrypted and are never matched here.
    where.push(
      sql`(lower(${benefits.title}) LIKE ${term} OR lower(${benefits.merchant}) LIKE ${term}
           OR lower(${benefits.notes}) LIKE ${term} OR lower(${benefits.tags}) LIKE ${term}
           OR lower(${benefits.conditions}) LIKE ${term})`,
    );
  }

  const order =
    f.sort === 'expiry'
      ? [sql`${benefits.expiresAt} IS NULL`, asc(benefits.expiresAt)]
      : f.sort === 'value'
        ? [desc(benefits.currentValueMinor)]
        : f.sort === 'title'
          ? [asc(benefits.title)]
          : [desc(benefits.updatedAt)];

  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, f.pageSize ?? 20));

  const rows = db
    .select()
    .from(benefits)
    .where(and(...where))
    .orderBy(...order)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  const total =
    db
      .select({ n: count() })
      .from(benefits)
      .where(and(...where))
      .get()?.n ?? 0;
  return { rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export function distinctMerchants(userId: string): string[] {
  return db
    .selectDistinct({ m: benefits.merchant })
    .from(benefits)
    .where(and(visibleBenefitWhere(userId), sql`${benefits.merchant} <> ''`))
    .orderBy(asc(benefits.merchant))
    .all()
    .map((r) => r.m);
}

/**
 * Top up recurring prepaid allowances (e.g. 4 classes per month) for periods
 * that have started and have not been applied yet. Idempotent per period via
 * recurrence_last_applied_period.
 */
export function applyRecurringAllowances(userId: string, today = todayIso()): number {
  const rows = db
    .select()
    .from(benefits)
    .where(
      and(
        eq(benefits.userId, userId),
        isNull(benefits.archivedAt),
        sql`${benefits.recurrence} <> 'none'`,
        isNotNull(benefits.recurrenceUnits),
      ),
    )
    .all();

  let applied = 0;
  for (const b of rows) {
    const period = periodKey(today, b.recurrence);
    if (b.recurrenceLastAppliedPeriod === period) continue;
    if (b.recurrenceAnchor && b.recurrenceAnchor > today) continue;
    const add = b.recurrenceUnits!;
    const next = (b.currentUnits ?? 0) + add;
    db.transaction((tx) => {
      tx.insert(balanceEvents)
        .values({
          id: newId('be_'),
          benefitId: b.id,
          actorUserId: userId,
          type: 'correction',
          deltaUnits: add,
          resultingUnits: next,
          resultingValueMinor: b.currentValueMinor,
          reason: `Recurring allowance for ${period}`,
          occurredAt: today,
        })
        .run();
      tx.update(benefits)
        .set({
          currentUnits: next,
          recurrenceLastAppliedPeriod: period,
          status: b.status === 'redeemed' ? 'available' : b.status,
          updatedAt: nowIso(),
        })
        .where(eq(benefits.id, b.id))
        .run();
    });
    applied += 1;
  }
  return applied;
}

function periodKey(date: string, recurrence: string): string {
  const [y, m] = date.split('-') as [string, string];
  if (recurrence === 'yearly') return y;
  if (recurrence === 'quarterly') return `${y}-Q${Math.floor((Number(m) - 1) / 3) + 1}`;
  return `${y}-${m}`;
}
