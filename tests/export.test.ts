import { beforeEach, describe, expect, it } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { createTar } from '@/lib/tar';
import { exportCsv, exportDocumentsArchive, exportJson, importBenefits } from '@/lib/exportdata';
import { createBenefit, listBenefits, recordBalanceEvent } from '@/lib/benefits';
import { createRefundCase } from '@/lib/refunds';
import { storeDocument } from '@/lib/documents';
import { todayIso } from '@/lib/dates';
import { makeUser, OFFSETS } from './helpers/factory';

const today = todayIso();
let user: ReturnType<typeof makeUser>;

beforeEach(() => {
  user = makeUser();
});

function seed() {
  const b = createBenefit({
    userId: user.id,
    title: 'Bluebird gift card',
    category: 'gift_card',
    merchant: 'Bluebird Books',
    currency: 'INR',
    originalValueMinor: 250_000,
    expiresAt: '2026-12-31',
    code: 'BB-7781-4432',
    reminderOffsets: OFFSETS,
  });
  recordBalanceEvent(
    user.id,
    b,
    { type: 'usage', amountMinor: 50_000, reason: 'books', occurredAt: today },
    OFFSETS,
  );
  createRefundCase({
    userId: user.id,
    merchant: 'Zentra',
    orderRef: 'ZE-1',
    currency: 'INR',
    amountMinor: 100_000,
    checkInDays: 7,
  });
  return b;
}

describe('JSON export', () => {
  it('includes the user’s records and their history', () => {
    seed();
    const data = exportJson(user.id, { includeCodes: false });
    expect(data.format).toBe('valueback-export');
    expect(data.benefits).toHaveLength(1);
    expect(data.benefits[0]!.balanceEvents).toHaveLength(2);
    expect(data.refundCases).toHaveLength(1);
    expect(data.recoveryEvents).toHaveLength(1);
  });

  it('never contains a password hash, a session or an encryption key', () => {
    seed();
    const serialised = JSON.stringify(exportJson(user.id, { includeCodes: false }));
    expect(serialised).not.toMatch(/passwordHash|password_hash/);
    expect(serialised).not.toMatch(/scrypt\$/);
    expect(serialised).not.toMatch(/sessions?"\s*:/);
    expect(serialised).not.toContain(process.env.APP_ENCRYPTION_KEY!);
  });

  it('omits redemption codes unless they are explicitly requested', () => {
    seed();
    const without = JSON.stringify(exportJson(user.id, { includeCodes: false }));
    expect(without).not.toContain('BB-7781-4432');
    expect(without).toContain('••••4432'); // the masked hint is safe

    const withCodes = exportJson(user.id, { includeCodes: true });
    expect(withCodes.containsRedemptionCodes).toBe(true);
    expect(JSON.stringify(withCodes)).toContain('BB-7781-4432');
  });

  it('never leaks another account’s records', () => {
    seed();
    const stranger = makeUser();
    createBenefit({
      userId: stranger.id,
      title: 'Not yours',
      category: 'gift_card',
      currency: 'INR',
      reminderOffsets: OFFSETS,
    });
    expect(JSON.stringify(exportJson(user.id, { includeCodes: false }))).not.toContain('Not yours');
  });
});

describe('CSV export', () => {
  it('writes a header row and the records, with codes masked', () => {
    seed();
    const csv = exportCsv(user.id, 'benefits');
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toContain('title,category,merchant');
    expect(lines).toHaveLength(2);
    expect(csv).toContain('Bluebird gift card');
    expect(csv).toContain('••••4432');
    expect(csv).not.toContain('BB-7781-4432');
  });

  it('escapes separators and quotes so a comma cannot break a row', () => {
    createBenefit({
      userId: user.id,
      title: 'Odd, "quoted" title',
      category: 'other',
      currency: 'INR',
      notes: 'line one\nline two',
      reminderOffsets: OFFSETS,
    });
    const csv = exportCsv(user.id, 'benefits');
    expect(csv).toContain('"Odd, ""quoted"" title"');
    expect(csv).toContain('"line one\nline two"');
  });

  it('writes amounts as decimals, not minor units', () => {
    seed();
    expect(exportCsv(user.id, 'benefits')).toContain('2500.00');
    expect(exportCsv(user.id, 'recovery')).toContain('500.00');
  });

  it('exports the whole ledger', () => {
    seed();
    const csv = exportCsv(user.id, 'balance-events');
    expect(csv.trim().split('\r\n')).toHaveLength(3); // header + initial + usage
  });
});

describe('document archive', () => {
  it('produces a gzipped tar containing the manifest and the files', async () => {
    seed();
    await storeDocument(user.id, new File(['a receipt'], 'receipt.txt', { type: 'text/plain' }));

    const gz = await exportDocumentsArchive(user.id, false);
    const tar = gunzipSync(gz);
    const text = tar.toString('latin1');

    expect(text).toContain('valueback-export.json');
    expect(text).toContain('README.txt');
    expect(text).toContain('receipt.txt');
    expect(text).toContain('a receipt');
    expect(text).toContain('Redemption codes are NOT included');
    expect(tar.length % 512).toBe(0); // valid tar blocking
  });

  it('warns loudly when codes are included', async () => {
    seed();
    const text = gunzipSync(await exportDocumentsArchive(user.id, true)).toString('latin1');
    expect(text).toContain('CONTAINS YOUR REDEMPTION CODES IN PLAIN TEXT');
  });
});

describe('tar writer', () => {
  it('writes a readable ustar header with a correct checksum', () => {
    const tar = createTar([{ name: 'hello.txt', data: Buffer.from('hi') }]);
    expect(tar.subarray(0, 9).toString('utf8')).toBe('hello.txt');
    expect(tar.subarray(257, 262).toString('utf8')).toBe('ustar');
    const stored = Number.parseInt(tar.subarray(148, 154).toString('ascii'), 8);
    const header = Buffer.from(tar.subarray(0, 512));
    header.write('        ', 148, 8, 'ascii');
    let sum = 0;
    for (const b of header) sum += b;
    expect(sum).toBe(stored);
  });
});

describe('import', () => {
  it('creates records from a previous export', () => {
    seed();
    const payload = exportJson(user.id, { includeCodes: false });
    const target = makeUser();

    const report = importBenefits(target.id, payload, {
      onDuplicate: 'skip',
      reminderOffsets: OFFSETS,
    });
    expect(report.created).toBe(1);
    expect(report.errors).toHaveLength(0);
    const imported = listBenefits(target.id).rows[0]!;
    expect(imported.title).toBe('Bluebird gift card');
    expect(imported.originalValueMinor).toBe(250_000);
    expect(imported.codeCipher).toBeNull(); // the export carried no code
  });

  it('skips likely duplicates and says why', () => {
    seed();
    const payload = exportJson(user.id, { includeCodes: false });
    const report = importBenefits(user.id, payload, {
      onDuplicate: 'skip',
      reminderOffsets: OFFSETS,
    });
    expect(report.created).toBe(0);
    expect(report.skippedDuplicates).toHaveLength(1);
    expect(report.skippedDuplicates[0]!.signals.length).toBeGreaterThan(0);
  });

  it('imports anyway when the user asks it to', () => {
    seed();
    const payload = exportJson(user.id, { includeCodes: false });
    const report = importBenefits(user.id, payload, {
      onDuplicate: 'import',
      reminderOffsets: OFFSETS,
    });
    expect(report.created).toBe(1);
    expect(listBenefits(user.id).total).toBe(2);
  });

  it('rejects bad rows individually and reports the reason', () => {
    const report = importBenefits(
      user.id,
      {
        benefits: [
          { title: '', category: 'gift_card', currency: 'INR' },
          { title: 'Bad category', category: 'not_a_category', currency: 'INR' },
          { title: 'Bad currency', category: 'gift_card', currency: 'XXX' },
          { title: 'Bad date', category: 'gift_card', currency: 'INR', expiresAt: '31-12-2026' },
          {
            title: 'Bad amount',
            category: 'gift_card',
            currency: 'INR',
            originalValueMinor: 'free',
          },
          { title: 'Good one', category: 'gift_card', currency: 'INR', originalValueMinor: 1000 },
        ],
      },
      { onDuplicate: 'skip', reminderOffsets: OFFSETS },
    );
    expect(report.created).toBe(1);
    expect(report.errors).toHaveLength(5);
    expect(report.errors.map((e) => e.problem).join(' ')).toMatch(/title is required/i);
    expect(report.errors.map((e) => e.problem).join(' ')).toMatch(/Unknown category/i);
    expect(report.errors.map((e) => e.problem).join(' ')).toMatch(/Unsupported currency/i);
  });

  it('rejects a file that is not an export at all', () => {
    const report = importBenefits(
      user.id,
      { something: 'else' },
      { onDuplicate: 'skip', reminderOffsets: OFFSETS },
    );
    expect(report.created).toBe(0);
    expect(report.errors[0]!.problem).toMatch(/not a ValueBack export/i);
  });

  it('accepts decimal amounts as well as minor units', () => {
    const report = importBenefits(
      user.id,
      {
        benefits: [
          {
            title: 'Decimal',
            category: 'gift_card',
            currency: 'INR',
            originalValueMinor: '1,250.50',
          },
        ],
      },
      { onDuplicate: 'skip', reminderOffsets: OFFSETS },
    );
    expect(report.created).toBe(1);
    expect(listBenefits(user.id).rows[0]!.originalValueMinor).toBe(125_050);
  });
});
