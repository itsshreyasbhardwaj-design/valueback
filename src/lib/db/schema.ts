/**
 * ValueBack persistence schema (SQLite via Drizzle).
 *
 * Conventions that keep a later PostgreSQL migration mechanical:
 *  - ids are opaque text (ULID-ish, see lib/ids.ts), never autoincrement ints
 *  - instants are ISO-8601 UTC strings  ("2026-03-04T10:00:00.000Z")  -> timestamptz
 *  - calendar dates are 'YYYY-MM-DD' text (no timezone semantics)      -> date
 *  - money is an integer count of MINOR units + an explicit currency code.
 *    There is no float anywhere in a money path.
 */
import { sql, relations } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/* ------------------------------------------------------------------ enums */

export const BENEFIT_CATEGORIES = [
  'gift_card',
  'store_credit',
  'refund',
  'cashback',
  'coupon',
  'prepaid_service',
  'membership_credit',
  'loyalty_reward',
  'travel_voucher',
  'other',
] as const;
export type BenefitCategory = (typeof BENEFIT_CATEGORIES)[number];

export const BENEFIT_STATUSES = [
  'unverified',
  'available',
  'partially_used',
  'redeemed',
  'expired_per_terms',
  'invalid',
  'archived',
] as const;
export type BenefitStatus = (typeof BENEFIT_STATUSES)[number];

/** Evidence basis for the numbers on a record. Never a bare percentage. */
export const EVIDENCE_LEVELS = [
  'user_entered',
  'document_extracted',
  'user_confirmed',
  'reverified',
  'provider_verified', // reserved: requires a real authorised integration (none exists)
] as const;
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

export const BALANCE_EVENT_TYPES = [
  'initial',
  'usage',
  'correction',
  'verified_update',
  'redeemed',
  'revalidation',
  'expiry_note',
] as const;
export type BalanceEventType = (typeof BALANCE_EVENT_TYPES)[number];

export const REFUND_STATUSES = [
  'requested',
  'accepted',
  'initiated',
  'awaiting_receipt',
  'received_confirmed',
  'partially_received',
  'disputed',
  'closed_without_receipt',
] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const REMINDER_KINDS = [
  'expiry',
  'follow_up',
  'prepaid_use',
  'refund_check_in',
  'custom',
] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export const REMINDER_STATUSES = ['scheduled', 'fired', 'snoozed', 'done', 'cancelled'] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export const RECOVERY_KINDS = [
  'refund_received',
  'credit_redeemed',
  'units_consumed',
  'discount_used',
] as const;
export type RecoveryKind = (typeof RECOVERY_KINDS)[number];

export const HOUSEHOLD_ROLES = ['owner', 'member', 'viewer'] as const;
export type HouseholdRole = (typeof HOUSEHOLD_ROLES)[number];

export const PERMISSIONS = ['view', 'edit'] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const PLANS = ['free', 'plus', 'family'] as const;
export type Plan = (typeof PLANS)[number];

export const EXTRACTION_STATUSES = ['pending', 'ok', 'empty', 'failed', 'unsupported'] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

export const CLAIM_ACTION_KINDS = [
  'follow_up_drafted',
  'called',
  'emailed',
  'chat',
  'escalated',
  'note',
] as const;
export type ClaimActionKind = (typeof CLAIM_ACTION_KINDS)[number];

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

/* ------------------------------------------------------------- identity */

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    /** stored lowercased; uniqueness enforced on this exact value */
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    name: text('name').notNull().default(''),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
    /** set while a deletion is pending confirmation; hard delete happens on confirm */
    deletionRequestedAt: text('deletion_requested_at'),
  },
  (t) => [uniqueIndex('users_email_uq').on(t.email)],
);

export const userSettings = sqliteTable('user_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  currency: text('currency').notNull().default('INR'),
  dateFormat: text('date_format')
    .$type<'dd/MM/yyyy' | 'MM/dd/yyyy' | 'yyyy-MM-dd'>()
    .notNull()
    .default('dd/MM/yyyy'),
  timeZone: text('time_zone').notNull().default('Asia/Kolkata'),
  theme: text('theme').$type<'system' | 'light' | 'dark'>().notNull().default('system'),
  /** JSON array of day offsets, e.g. [30,14,7,3,1] */
  reminderOffsets: text('reminder_offsets').notNull().default('[30,14,7,3,1]'),
  refundCheckInDays: integer('refund_check_in_days').notNull().default(7),
  notifyInApp: integer('notify_in_app', { mode: 'boolean' }).notNull().default(true),
  notifyBrowser: integer('notify_browser', { mode: 'boolean' }).notNull().default(false),
  /** opt-in: include document text in search index */
  searchDocumentText: integer('search_document_text', { mode: 'boolean' }).notNull().default(true),
  onboardingStep: integer('onboarding_step').notNull().default(0),
  onboardingCompletedAt: text('onboarding_completed_at'),
  /** JSON array of category ids the user said they want to track */
  onboardingInterests: text('onboarding_interests').notNull().default('[]'),
  updatedAt: text('updated_at').notNull().default(now),
});

export const sessions = sqliteTable(
  'sessions',
  {
    /** sha-256 of the opaque cookie token; the raw token is never stored */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').notNull().default(now),
    expiresAt: text('expires_at').notNull(),
    lastSeenAt: text('last_seen_at').notNull().default(now),
    userAgent: text('user_agent').notNull().default(''),
  },
  (t) => [index('sessions_user_idx').on(t.userId), index('sessions_expiry_idx').on(t.expiresAt)],
);

export const recoveryCodes = sqliteTable(
  'recovery_codes',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** scrypt hash of the single-use code */
    codeHash: text('code_hash').notNull(),
    createdAt: text('created_at').notNull().default(now),
    usedAt: text('used_at'),
  },
  (t) => [index('recovery_codes_user_idx').on(t.userId)],
);

export const entitlements = sqliteTable('entitlements', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  plan: text('plan').$type<Plan>().notNull().default('free'),
  /** 'default' | 'dev_override' — no payment provider is connected */
  source: text('source').$type<'default' | 'dev_override'>().notNull().default('default'),
  updatedAt: text('updated_at').notNull().default(now),
});

/* ------------------------------------------------------------- benefits */

export const benefits = sqliteTable(
  'benefits',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    category: text('category').$type<BenefitCategory>().notNull(),
    merchant: text('merchant').notNull().default(''),
    currency: text('currency').notNull().default('INR'),

    /** face value at issue, minor units; null when the benefit is not monetary */
    originalValueMinor: integer('original_value_minor'),
    /**
     * CACHE of the append-only balance event ledger (balance_events).
     * Written only inside the same transaction as the event that changes it.
     * lib/benefits.ts#recomputeBalance is the single writer; a unit test asserts
     * cache === ledger sum.
     */
    currentValueMinor: integer('current_value_minor'),

    /** non-monetary quantities, e.g. 10 yoga classes. Integer units only. */
    unitLabel: text('unit_label'),
    originalUnits: integer('original_units'),
    currentUnits: integer('current_units'),

    status: text('status').$type<BenefitStatus>().notNull().default('unverified'),
    evidence: text('evidence').$type<EvidenceLevel>().notNull().default('user_entered'),

    issuedAt: text('issued_at'), // YYYY-MM-DD
    receivedAt: text('received_at'), // YYYY-MM-DD
    expiresAt: text('expires_at'), // YYYY-MM-DD
    verifiedAt: text('verified_at'), // YYYY-MM-DD, last time the user checked the real balance

    conditions: text('conditions').notNull().default(''),
    notes: text('notes').notNull().default(''),
    /** JSON string array */
    tags: text('tags').notNull().default('[]'),

    /** AES-256-GCM envelope of a redemption code; never logged, never searched */
    codeCipher: text('code_cipher'),
    codeHint: text('code_hint'), // e.g. "••••1234", safe to display

    /** recurring prepaid allowances, e.g. 4 sessions per month */
    recurrence: text('recurrence')
      .$type<'none' | 'monthly' | 'quarterly' | 'yearly'>()
      .notNull()
      .default('none'),
    recurrenceUnits: integer('recurrence_units'),
    recurrenceAnchor: text('recurrence_anchor'), // YYYY-MM-DD
    recurrenceLastAppliedPeriod: text('recurrence_last_applied_period'), // YYYY-MM

    archivedAt: text('archived_at'),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (t) => [
    index('benefits_user_idx').on(t.userId, t.status),
    index('benefits_expiry_idx').on(t.userId, t.expiresAt),
    index('benefits_merchant_idx').on(t.userId, t.merchant),
    index('benefits_updated_idx').on(t.userId, t.updatedAt),
  ],
);

export const balanceEvents = sqliteTable(
  'balance_events',
  {
    id: text('id').primaryKey(),
    benefitId: text('benefit_id')
      .notNull()
      .references(() => benefits.id, { onDelete: 'cascade' }),
    /** who recorded it (household members may act on shared records) */
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<BalanceEventType>().notNull(),
    /** signed minor units; negative = value left the benefit */
    deltaMinor: integer('delta_minor'),
    deltaUnits: integer('delta_units'),
    /** balance AFTER this event — makes the ledger auditable without replay */
    resultingValueMinor: integer('resulting_value_minor'),
    resultingUnits: integer('resulting_units'),
    reason: text('reason').notNull().default(''),
    documentId: text('document_id'),
    occurredAt: text('occurred_at').notNull(), // YYYY-MM-DD
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => [index('balance_events_benefit_idx').on(t.benefitId, t.createdAt)],
);

/* ------------------------------------------------------------ documents */

export const documents = sqliteTable(
  'documents',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    benefitId: text('benefit_id').references(() => benefits.id, { onDelete: 'set null' }),
    refundCaseId: text('refund_case_id'),
    filename: text('filename').notNull(),
    mime: text('mime').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256').notNull(),
    /** path relative to STORAGE_DIR; files live outside the web root */
    storagePath: text('storage_path').notNull(),
    extractionStatus: text('extraction_status')
      .$type<ExtractionStatus>()
      .notNull()
      .default('pending'),
    extractionEngine: text('extraction_engine')
      .$type<'none' | 'text' | 'pdfjs' | 'ocr' | 'eml'>()
      .notNull()
      .default('none'),
    extractedText: text('extracted_text'),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => [
    index('documents_user_idx').on(t.userId, t.createdAt),
    index('documents_hash_idx').on(t.userId, t.sha256),
    index('documents_benefit_idx').on(t.benefitId),
  ],
);

export const extractions = sqliteTable(
  'extractions',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    /** winning rule-based classification */
    classification: text('classification').$type<BenefitCategory | 'refund_case'>(),
    classificationScore: integer('classification_score').notNull().default(0),
    /** JSON: { field: { value, confidence, evidence } } — PROPOSED, never authoritative */
    proposedJson: text('proposed_json').notNull().default('{}'),
    /** JSON of what the user actually accepted, written on review */
    acceptedJson: text('accepted_json'),
    reviewedAt: text('reviewed_at'),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => [index('extractions_document_idx').on(t.documentId)],
);

/* -------------------------------------------------------------- refunds */

export const refundCases = sqliteTable(
  'refund_cases',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    merchant: text('merchant').notNull(),
    orderRef: text('order_ref').notNull().default(''),
    referenceNumber: text('reference_number').notNull().default(''),
    currency: text('currency').notNull().default('INR'),
    /** amount the user expects back */
    amountMinor: integer('amount_minor').notNull(),
    /** amount the user has CONFIRMED receiving; only this feeds realised value */
    receivedAmountMinor: integer('received_amount_minor').notNull().default(0),
    purchaseDate: text('purchase_date'),
    initiatedAt: text('initiated_at'),
    expectedByDate: text('expected_by_date'),
    method: text('method').notNull().default(''),
    status: text('status').$type<RefundStatus>().notNull().default('requested'),
    notes: text('notes').notNull().default(''),
    confirmedAt: text('confirmed_at'),
    closedReason: text('closed_reason').notNull().default(''),
    archivedAt: text('archived_at'),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (t) => [
    index('refund_cases_user_idx').on(t.userId, t.status),
    index('refund_cases_expected_idx').on(t.userId, t.expectedByDate),
  ],
);

export const refundEvents = sqliteTable(
  'refund_events',
  {
    id: text('id').primaryKey(),
    refundCaseId: text('refund_case_id')
      .notNull()
      .references(() => refundCases.id, { onDelete: 'cascade' }),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fromStatus: text('from_status').$type<RefundStatus>(),
    toStatus: text('to_status').$type<RefundStatus>().notNull(),
    amountMinor: integer('amount_minor'),
    note: text('note').notNull().default(''),
    documentId: text('document_id'),
    occurredAt: text('occurred_at').notNull(), // YYYY-MM-DD
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => [index('refund_events_case_idx').on(t.refundCaseId, t.createdAt)],
);

export const claimActions = sqliteTable(
  'claim_actions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    refundCaseId: text('refund_case_id').references(() => refundCases.id, { onDelete: 'cascade' }),
    benefitId: text('benefit_id').references(() => benefits.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<ClaimActionKind>().notNull(),
    summary: text('summary').notNull().default(''),
    /** household follow-up ownership */
    assigneeUserId: text('assignee_user_id').references(() => users.id, { onDelete: 'set null' }),
    dueAt: text('due_at'), // YYYY-MM-DD
    completedAt: text('completed_at'),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => [
    index('claim_actions_case_idx').on(t.refundCaseId),
    index('claim_actions_assignee_idx').on(t.assigneeUserId, t.completedAt),
  ],
);

/* ------------------------------------------------- reminders & notifications */

export const reminders = sqliteTable(
  'reminders',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    benefitId: text('benefit_id').references(() => benefits.id, { onDelete: 'cascade' }),
    refundCaseId: text('refund_case_id').references(() => refundCases.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<ReminderKind>().notNull(),
    label: text('label').notNull().default(''),
    dueAt: text('due_at').notNull(), // YYYY-MM-DD
    offsetDays: integer('offset_days'),
    status: text('status').$type<ReminderStatus>().notNull().default('scheduled'),
    snoozedUntil: text('snoozed_until'),
    lastFiredAt: text('last_fired_at'),
    /**
     * Idempotency key for the scheduler: re-running it can never create a second
     * reminder or a second notification for the same (record, kind, date).
     */
    dedupeKey: text('dedupe_key').notNull(),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => [
    uniqueIndex('reminders_dedupe_uq').on(t.userId, t.dedupeKey),
    index('reminders_due_idx').on(t.userId, t.status, t.dueAt),
  ],
);

export const notifications = sqliteTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reminderId: text('reminder_id').references(() => reminders.id, { onDelete: 'cascade' }),
    benefitId: text('benefit_id').references(() => benefits.id, { onDelete: 'cascade' }),
    refundCaseId: text('refund_case_id').references(() => refundCases.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    severity: text('severity').$type<'info' | 'warning' | 'urgent'>().notNull().default('info'),
    dedupeKey: text('dedupe_key').notNull(),
    readAt: text('read_at'),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => [
    uniqueIndex('notifications_dedupe_uq').on(t.userId, t.dedupeKey),
    index('notifications_unread_idx').on(t.userId, t.readAt),
  ],
);

/* ------------------------------------------------------------ households */

export const households = sqliteTable('households', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ownerUserId: text('owner_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull().default(now),
});

export const householdMembers = sqliteTable(
  'household_members',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').$type<HouseholdRole>().notNull().default('member'),
    joinedAt: text('joined_at').notNull().default(now),
  },
  (t) => [
    uniqueIndex('household_members_uq').on(t.householdId, t.userId),
    index('household_members_user_idx').on(t.userId),
  ],
);

export const householdInvites = sqliteTable(
  'household_invites',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    /** sha-256 of the invite token; the raw token exists only in the copied link */
    tokenHash: text('token_hash').notNull(),
    role: text('role').$type<HouseholdRole>().notNull().default('member'),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: text('expires_at').notNull(),
    acceptedByUserId: text('accepted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    acceptedAt: text('accepted_at'),
    revokedAt: text('revoked_at'),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => [
    uniqueIndex('household_invites_token_uq').on(t.tokenHash),
    index('household_invites_household_idx').on(t.householdId),
  ],
);

/**
 * Explicit per-record sharing. Household membership alone grants NOTHING;
 * a row here is the only way another member sees a benefit or refund case.
 */
export const accessGrants = sqliteTable(
  'access_grants',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    resourceType: text('resource_type').$type<'benefit' | 'refund_case'>().notNull(),
    resourceId: text('resource_id').notNull(),
    /** the record owner, kept denormalised so revocation checks are one row read */
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    permission: text('permission').$type<Permission>().notNull().default('view'),
    grantedByUserId: text('granted_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').notNull().default(now),
    revokedAt: text('revoked_at'),
  },
  (t) => [
    uniqueIndex('access_grants_uq').on(t.householdId, t.resourceType, t.resourceId),
    index('access_grants_lookup_idx').on(t.resourceType, t.resourceId, t.revokedAt),
  ],
);

/* ------------------------------------------------- realised value + audit */

/**
 * The ONLY source of "value actually recovered". Outstanding value is read from
 * benefits.current_value_minor / refund_cases.amount_minor. The two never overlap,
 * which is what stops ₹1,000 and ₹600 being counted as separate assets.
 */
export const recoveryEvents = sqliteTable(
  'recovery_events',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<RecoveryKind>().notNull(),
    benefitId: text('benefit_id').references(() => benefits.id, { onDelete: 'cascade' }),
    refundCaseId: text('refund_case_id').references(() => refundCases.id, { onDelete: 'cascade' }),
    currency: text('currency').notNull().default('INR'),
    amountMinor: integer('amount_minor'),
    units: integer('units'),
    note: text('note').notNull().default(''),
    occurredAt: text('occurred_at').notNull(), // YYYY-MM-DD
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => [
    index('recovery_events_user_idx').on(t.userId, t.occurredAt),
    index('recovery_events_kind_idx').on(t.userId, t.kind),
  ],
);

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    userId: text('user_id'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull().default(''),
    entityId: text('entity_id').notNull().default(''),
    /** JSON; lib/audit.ts strips amounts, codes and document text before writing */
    meta: text('meta').notNull().default('{}'),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => [index('audit_user_idx').on(t.userId, t.createdAt)],
);

/* ------------------------------------------------------------- relations */

export const benefitRelations = relations(benefits, ({ many, one }) => ({
  events: many(balanceEvents),
  documents: many(documents),
  owner: one(users, { fields: [benefits.userId], references: [users.id] }),
}));

export const refundCaseRelations = relations(refundCases, ({ many }) => ({
  events: many(refundEvents),
  actions: many(claimActions),
}));

export const documentRelations = relations(documents, ({ many, one }) => ({
  extractions: many(extractions),
  benefit: one(benefits, { fields: [documents.benefitId], references: [benefits.id] }),
}));
