import 'server-only';
import { eq } from 'drizzle-orm';
import { gzipSync } from 'node:zlib';
import { db } from './db';
import {
  balanceEvents,
  benefits,
  claimActions,
  documents,
  extractions,
  recoveryEvents,
  refundCases,
  refundEvents,
  reminders,
  userSettings,
  users,
  BENEFIT_CATEGORIES,
  type BenefitCategory,
} from './db/schema';
import { decryptSecret } from './crypto';
import { createTar, type TarEntry } from './tar';
import { minorToDecimalString, parseMoneyToMinor, isSupportedCurrency } from './money';
import { isIsoDate, nowIso, todayIso } from './dates';
import { readDocumentBytes } from './documents';
import { createBenefit } from './benefits';
import { findBenefitDuplicates } from './duplicates';
import { audit } from './audit';

export const EXPORT_VERSION = 2;

/**
 * Everything the signed-in user owns, as plain JSON.
 *
 * Never included: password hash, session rows, the encryption key, audit rows
 * for other people, or any record belonging to someone else. Redemption codes
 * are omitted unless `includeCodes` is set, which the UI gates behind a
 * password re-entry and an explicit warning.
 */
export function exportJson(userId: string, opts: { includeCodes: boolean }) {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw new Error('User not found');
  const settings = db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();

  const ownBenefits = db.select().from(benefits).where(eq(benefits.userId, userId)).all();
  const ownRefunds = db.select().from(refundCases).where(eq(refundCases.userId, userId)).all();
  const ownDocuments = db.select().from(documents).where(eq(documents.userId, userId)).all();

  const payload = {
    format: 'valueback-export',
    version: EXPORT_VERSION,
    exportedAt: nowIso(),
    containsRedemptionCodes: opts.includeCodes,
    account: { email: user.email, name: user.name, createdAt: user.createdAt },
    settings: settings ? { ...settings, userId: undefined } : null,
    benefits: ownBenefits.map((b) => ({
      ...b,
      userId: undefined,
      codeCipher: undefined,
      tags: safeJson(b.tags),
      redemptionCode: opts.includeCodes && b.codeCipher ? decryptSecret(b.codeCipher) : undefined,
      balanceEvents: db
        .select()
        .from(balanceEvents)
        .where(eq(balanceEvents.benefitId, b.id))
        .all()
        .map((e) => ({ ...e, actorUserId: undefined })),
    })),
    refundCases: ownRefunds.map((r) => ({
      ...r,
      userId: undefined,
      events: db
        .select()
        .from(refundEvents)
        .where(eq(refundEvents.refundCaseId, r.id))
        .all()
        .map((e) => ({ ...e, actorUserId: undefined })),
      actions: db
        .select()
        .from(claimActions)
        .where(eq(claimActions.refundCaseId, r.id))
        .all()
        .map((a) => ({ ...a, userId: undefined, assigneeUserId: undefined })),
    })),
    documents: ownDocuments.map((d) => ({
      id: d.id,
      filename: d.filename,
      mime: d.mime,
      sizeBytes: d.sizeBytes,
      sha256: d.sha256,
      createdAt: d.createdAt,
      benefitId: d.benefitId,
      refundCaseId: d.refundCaseId,
      extractionStatus: d.extractionStatus,
      extractedText: d.extractedText,
      archivePath: `documents/${d.id}-${safeName(d.filename)}`,
      extractions: db.select().from(extractions).where(eq(extractions.documentId, d.id)).all(),
    })),
    reminders: db
      .select()
      .from(reminders)
      .where(eq(reminders.userId, userId))
      .all()
      .map((r) => ({ ...r, userId: undefined })),
    recoveryEvents: db
      .select()
      .from(recoveryEvents)
      .where(eq(recoveryEvents.userId, userId))
      .all()
      .map((r) => ({ ...r, userId: undefined })),
  };
  audit(userId, 'export.json', 'user', userId, { includeCodes: opts.includeCodes });
  return payload;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return [];
  }
}

function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 60) || 'file';
}

/* ----------------------------------------------------------------- CSV */

function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  // BOM so Excel on Windows reads UTF-8 (rupee symbols) correctly.
  return '﻿' + [headers, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n') + '\r\n';
}

export type CsvKind = 'benefits' | 'refunds' | 'recovery' | 'balance-events';

/** CSV never contains redemption codes, only the masked hint. */
export function exportCsv(userId: string, kind: CsvKind): string {
  if (kind === 'benefits') {
    const rows = db.select().from(benefits).where(eq(benefits.userId, userId)).all();
    return toCsv(
      [
        'id',
        'title',
        'category',
        'merchant',
        'currency',
        'original_value',
        'current_value',
        'current_units',
        'unit_label',
        'status',
        'evidence',
        'issued_at',
        'received_at',
        'expires_at',
        'verified_at',
        'tags',
        'conditions',
        'notes',
        'code_hint',
        'archived_at',
        'created_at',
      ],
      rows.map((b) => [
        b.id,
        b.title,
        b.category,
        b.merchant,
        b.currency,
        b.originalValueMinor == null ? '' : minorToDecimalString(b.originalValueMinor, b.currency),
        b.currentValueMinor == null ? '' : minorToDecimalString(b.currentValueMinor, b.currency),
        b.currentUnits ?? '',
        b.unitLabel ?? '',
        b.status,
        b.evidence,
        b.issuedAt ?? '',
        b.receivedAt ?? '',
        b.expiresAt ?? '',
        b.verifiedAt ?? '',
        b.tags,
        b.conditions,
        b.notes,
        b.codeHint ?? '',
        b.archivedAt ?? '',
        b.createdAt,
      ]),
    );
  }
  if (kind === 'refunds') {
    const rows = db.select().from(refundCases).where(eq(refundCases.userId, userId)).all();
    return toCsv(
      [
        'id',
        'merchant',
        'order_ref',
        'reference_number',
        'currency',
        'amount',
        'received_amount',
        'status',
        'purchase_date',
        'initiated_at',
        'expected_by',
        'method',
        'confirmed_at',
        'closed_reason',
        'notes',
        'created_at',
      ],
      rows.map((r) => [
        r.id,
        r.merchant,
        r.orderRef,
        r.referenceNumber,
        r.currency,
        minorToDecimalString(r.amountMinor, r.currency),
        minorToDecimalString(r.receivedAmountMinor, r.currency),
        r.status,
        r.purchaseDate ?? '',
        r.initiatedAt ?? '',
        r.expectedByDate ?? '',
        r.method,
        r.confirmedAt ?? '',
        r.closedReason,
        r.notes,
        r.createdAt,
      ]),
    );
  }
  if (kind === 'recovery') {
    const rows = db.select().from(recoveryEvents).where(eq(recoveryEvents.userId, userId)).all();
    return toCsv(
      [
        'id',
        'kind',
        'occurred_at',
        'currency',
        'amount',
        'units',
        'benefit_id',
        'refund_case_id',
        'note',
      ],
      rows.map((r) => [
        r.id,
        r.kind,
        r.occurredAt,
        r.currency,
        r.amountMinor == null ? '' : minorToDecimalString(r.amountMinor, r.currency),
        r.units ?? '',
        r.benefitId ?? '',
        r.refundCaseId ?? '',
        r.note,
      ]),
    );
  }
  const owned = db
    .select({ id: benefits.id, currency: benefits.currency })
    .from(benefits)
    .where(eq(benefits.userId, userId))
    .all();
  const byId = new Map(owned.map((o) => [o.id, o.currency]));
  const rows = owned.flatMap((o) =>
    db.select().from(balanceEvents).where(eq(balanceEvents.benefitId, o.id)).all(),
  );
  return toCsv(
    [
      'id',
      'benefit_id',
      'type',
      'occurred_at',
      'delta',
      'delta_units',
      'resulting_value',
      'resulting_units',
      'reason',
    ],
    rows.map((e) => {
      const cur = byId.get(e.benefitId) ?? 'INR';
      return [
        e.id,
        e.benefitId,
        e.type,
        e.occurredAt,
        e.deltaMinor == null ? '' : minorToDecimalString(e.deltaMinor, cur),
        e.deltaUnits ?? '',
        e.resultingValueMinor == null ? '' : minorToDecimalString(e.resultingValueMinor, cur),
        e.resultingUnits ?? '',
        e.reason,
      ];
    }),
  );
}

/* -------------------------------------------------- documents archive */

/** .tar.gz of every uploaded file plus the JSON manifest. */
export async function exportDocumentsArchive(
  userId: string,
  includeCodes: boolean,
): Promise<Buffer> {
  const payload = exportJson(userId, { includeCodes });
  const entries: TarEntry[] = [
    { name: 'valueback-export.json', data: Buffer.from(JSON.stringify(payload, null, 2), 'utf8') },
    { name: 'README.txt', data: Buffer.from(archiveReadme(includeCodes), 'utf8') },
  ];
  const docs = db.select().from(documents).where(eq(documents.userId, userId)).all();
  for (const d of docs) {
    try {
      entries.push({
        name: `documents/${d.id}-${safeName(d.filename)}`,
        data: await readDocumentBytes(d),
      });
    } catch {
      entries.push({
        name: `documents/${d.id}-MISSING.txt`,
        data: Buffer.from(
          `The stored file for document ${d.id} (${d.filename}) could not be read.\n`,
          'utf8',
        ),
      });
    }
  }
  audit(userId, 'export.archive', 'user', userId, { files: docs.length });
  return gzipSync(createTar(entries));
}

function archiveReadme(includeCodes: boolean): string {
  return [
    'ValueBack data export',
    '=====================',
    '',
    'valueback-export.json  — your records, settings, balance history and reminders.',
    'documents/             — every file you uploaded, named <document id>-<original name>.',
    '',
    includeCodes
      ? 'WARNING: this export CONTAINS YOUR REDEMPTION CODES IN PLAIN TEXT. Anyone who' +
        '\nopens it can spend those gift cards and vouchers. Store it encrypted and delete' +
        '\nit when you no longer need it.'
      : 'Redemption codes are NOT included in this export. Only the masked hint (for' +
        '\nexample ****4321) appears. Re-export with "include codes" if you need them.',
    '',
    'This file was produced locally by your own copy of ValueBack. Nothing was uploaded.',
    '',
  ].join('\n');
}

/* --------------------------------------------------------------- import */

export type ImportReport = {
  created: number;
  skippedDuplicates: Array<{ title: string; existingId: string; signals: string[] }>;
  errors: Array<{ index: number; title: string; problem: string }>;
};

type ImportOptions = { onDuplicate: 'skip' | 'import'; reminderOffsets: number[] };

/**
 * Import benefits from a previous export (or a hand-written file of the same
 * shape). Validates every row, never trusts an id from the file, and reports
 * exactly what it skipped — nothing is merged silently.
 */
export function importBenefits(userId: string, raw: unknown, opts: ImportOptions): ImportReport {
  const report: ImportReport = { created: 0, skippedDuplicates: [], errors: [] };
  const list = extractBenefitList(raw);
  if (!list) {
    report.errors.push({
      index: 0,
      title: '',
      problem: 'The file is not a ValueBack export and has no "benefits" array.',
    });
    return report;
  }

  list.forEach((item, index) => {
    const row = item as Record<string, unknown>;
    const title = String(row.title ?? '').trim();
    try {
      if (!title) throw new Error('A title is required.');
      const category = String(row.category ?? 'other') as BenefitCategory;
      if (!BENEFIT_CATEGORIES.includes(category))
        throw new Error(`Unknown category "${String(row.category)}".`);
      const currency = String(row.currency ?? 'INR').toUpperCase();
      if (!isSupportedCurrency(currency)) throw new Error(`Unsupported currency "${currency}".`);

      const original = readMinor(row.originalValueMinor ?? row.original_value, currency);
      const current = readMinor(row.currentValueMinor ?? row.current_value, currency);
      for (const [field, value] of [
        ['issuedAt', row.issuedAt ?? row.issued_at],
        ['receivedAt', row.receivedAt ?? row.received_at],
        ['expiresAt', row.expiresAt ?? row.expires_at],
      ] as const) {
        if (value != null && value !== '' && !isIsoDate(String(value))) {
          throw new Error(`${field} must be a YYYY-MM-DD date.`);
        }
      }

      const candidate = {
        title,
        merchant: String(row.merchant ?? ''),
        category,
        currency,
        originalValueMinor: original,
        issuedAt: str(row.issuedAt ?? row.issued_at),
        expiresAt: str(row.expiresAt ?? row.expires_at),
        codeHint: str(row.codeHint ?? row.code_hint),
      };
      const dupes = findBenefitDuplicates(userId, candidate, 1);
      if (dupes.length && dupes[0]!.strength === 'strong' && opts.onDuplicate === 'skip') {
        report.skippedDuplicates.push({
          title,
          existingId: dupes[0]!.record.id,
          signals: dupes[0]!.signals,
        });
        return;
      }

      createBenefit({
        userId,
        title,
        category,
        merchant: candidate.merchant,
        currency,
        originalValueMinor: original,
        currentValueMinor: current ?? original,
        unitLabel: str(row.unitLabel ?? row.unit_label),
        originalUnits: readInt(row.currentUnits ?? row.originalUnits ?? row.current_units),
        issuedAt: candidate.issuedAt,
        receivedAt: str(row.receivedAt ?? row.received_at),
        expiresAt: candidate.expiresAt,
        conditions: String(row.conditions ?? '').slice(0, 2000),
        notes: String(row.notes ?? '').slice(0, 2000),
        tags: Array.isArray(row.tags) ? row.tags.map(String).slice(0, 12) : [],
        code:
          typeof row.redemptionCode === 'string' && row.redemptionCode ? row.redemptionCode : null,
        evidence: 'user_entered',
        reminderOffsets: opts.reminderOffsets,
      });
      report.created += 1;
    } catch (err) {
      report.errors.push({
        index,
        title,
        problem: err instanceof Error ? err.message : 'Unknown problem.',
      });
    }
  });

  audit(userId, 'import.benefits', 'user', userId, {
    created: report.created,
    errors: report.errors.length,
  });
  return report;
}

function extractBenefitList(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object' && Array.isArray((raw as { benefits?: unknown }).benefits)) {
    return (raw as { benefits: unknown[] }).benefits;
  }
  return null;
}

function str(v: unknown): string | null {
  return v == null || v === '' ? null : String(v);
}

function readInt(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0)
    throw new Error('Units must be a whole number of zero or more.');
  return n;
}

/** Accepts either minor units (integer from our own export) or a decimal string. */
function readMinor(v: unknown, currency: string): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    if (!Number.isInteger(v) || v < 0)
      throw new Error('Amounts must be whole minor units (for example 250000 for 2500.00).');
    return v;
  }
  const parsed = parseMoneyToMinor(String(v), currency);
  if (parsed == null || parsed < 0) throw new Error(`"${String(v)}" is not a valid amount.`);
  return parsed;
}

export function exportFilename(kind: string, ext: string): string {
  return `valueback-${kind}-${todayIso()}.${ext}`;
}
