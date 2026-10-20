import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { documents, extractions } from '@/lib/db/schema';
import {
  UPLOAD_MAX_BYTES,
  deleteDocument,
  documentAbsolutePath,
  documentsThisMonth,
  extractTextFromPdf,
  latestExtraction,
  listDocuments,
  parseExtraction,
  processDocument,
  sniffType,
  storeDocument,
} from '@/lib/documents';
import { findDocumentByHash } from '@/lib/duplicates';
import { ocrAvailable } from '@/lib/ocr';
import { makeTextPdf } from './helpers/make-pdf';
import { makeUser } from './helpers/factory';

let user: ReturnType<typeof makeUser>;
beforeEach(() => {
  user = makeUser();
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);

describe('file type sniffing', () => {
  it('identifies real files by their bytes', () => {
    expect(sniffType(PNG, 'anything.txt')).toMatchObject({ kind: 'image', mime: 'image/png' });
    expect(sniffType(JPEG, 'photo.bin')).toMatchObject({ kind: 'image', mime: 'image/jpeg' });
    expect(sniffType(Buffer.from('%PDF-1.4 ...'), 'x')).toMatchObject({ kind: 'pdf' });
    expect(sniffType(Buffer.from('Hello receipt'), 'note.txt')).toMatchObject({ kind: 'text' });
    expect(
      sniffType(Buffer.from('From: a@b.c\r\nSubject: hi\r\n\r\nbody'), 'mail.eml'),
    ).toMatchObject({ kind: 'eml' });
  });

  it('refuses a file renamed to look safe', () => {
    const elf = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0, 0, 0]);
    expect(sniffType(elf, 'invoice.pdf')).toHaveProperty('error');
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    expect(sniffType(zip, 'receipt.png')).toHaveProperty('error');
  });

  it('refuses binary rubbish claiming to be text', () => {
    const noisy = Buffer.from([0x01, 0x02, 0x03, 0x00, 0x04, 0x05]);
    expect(sniffType(noisy, 'notes.txt')).toHaveProperty('error');
  });
});

describe('storing an upload', () => {
  it('writes the file privately and records its hash', async () => {
    const result = await storeDocument(
      user.id,
      new File(['Gift card value: INR 500.00'], 'card.txt', { type: 'text/plain' }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.document.sha256).toHaveLength(64);
    expect(result.document.storagePath.startsWith(`${user.id}/`)).toBe(true);
    expect(readFileSync(documentAbsolutePath(result.document), 'utf8')).toContain('INR 500.00');
  });

  it('rejects an empty file and an oversized one', async () => {
    const empty = await storeDocument(user.id, new File([], 'empty.txt', { type: 'text/plain' }));
    expect(empty.ok).toBe(false);

    const huge = new File([new Uint8Array(UPLOAD_MAX_BYTES + 1)], 'big.png', { type: 'image/png' });
    const tooBig = await storeDocument(user.id, huge);
    expect(tooBig.ok).toBe(false);
    if (!tooBig.ok) expect(tooBig.error).toMatch(/8 MB or smaller/i);
  });

  it('flags a byte-identical re-upload without merging anything', async () => {
    const bytes = 'Exactly the same receipt';
    const first = await storeDocument(user.id, new File([bytes], 'a.txt', { type: 'text/plain' }));
    const second = await storeDocument(user.id, new File([bytes], 'b.txt', { type: 'text/plain' }));
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(second.duplicateOfId).toBe(first.document.id);
    // Both rows survive: the user decides.
    expect(listDocuments(user.id)).toHaveLength(2);
    expect(findDocumentByHash(user.id, second.document.sha256, second.document.id)?.id).toBe(
      first.document.id,
    );
  });

  it('never matches another account’s files when looking for duplicates', async () => {
    const stranger = makeUser();
    const bytes = 'Shared text';
    await storeDocument(stranger.id, new File([bytes], 'theirs.txt', { type: 'text/plain' }));
    const mine = await storeDocument(
      user.id,
      new File([bytes], 'mine.txt', { type: 'text/plain' }),
    );
    expect(mine.ok).toBe(true);
    if (!mine.ok) return;
    expect(mine.duplicateOfId).toBeNull();
    expect(findDocumentByHash(user.id, mine.document.sha256, mine.document.id)).toBeNull();
  });

  it('counts uploads for the monthly plan limit', async () => {
    await storeDocument(user.id, new File(['one'], 'a.txt', { type: 'text/plain' }));
    await storeDocument(user.id, new File(['two'], 'b.txt', { type: 'text/plain' }));
    expect(documentsThisMonth(user.id)).toBe(2);
  });
});

describe('processing a document', () => {
  it('reads a text file and proposes fields without saving anything to a benefit', async () => {
    const receipt = [
      'BLUEBIRD BOOKS',
      'Gift card value: INR 2,500.00',
      'Valid till 31/12/2026',
      'Order No: BB-99120',
    ].join('\n');
    const stored = await storeDocument(
      user.id,
      new File([receipt], 'card.txt', { type: 'text/plain' }),
    );
    if (!stored.ok) throw new Error('setup');

    const { document, result } = await processDocument(stored.document, 'INR');
    expect(document.extractionStatus).toBe('ok');
    expect(document.extractionEngine).toBe('text');
    expect(result?.classification).toBe('gift_card');
    expect(result?.fields.amountMinor?.value).toBe(250_000);
    expect(result?.fields.expiresAt?.value).toBe('2026-12-31');

    // The proposal is stored for review; no benefit exists yet.
    const row = latestExtraction(document.id)!;
    expect(row.reviewedAt).toBeNull();
    expect(parseExtraction(row)?.fields.orderRef?.value).toBe('BB-99120');
  });

  it('reads a real PDF text layer', async () => {
    const pdf = makeTextPdf([
      'URBAN GREENS',
      'Gift Card',
      'Card value: INR 1500.00',
      'Valid till 01/06/2027',
    ]);
    const text = await extractTextFromPdf(pdf);
    expect(text.status).toBe('ok');
    expect(text.engine).toBe('pdfjs');
    expect(text.text).toContain('1500.00');

    const stored = await storeDocument(
      user.id,
      new File([new Uint8Array(pdf)], 'card.pdf', { type: 'application/pdf' }),
    );
    if (!stored.ok) throw new Error('setup');
    const { result } = await processDocument(stored.document, 'INR');
    expect(result?.fields.amountMinor?.value).toBe(150_000);
    expect(result?.fields.expiresAt?.value).toBe('2027-06-01');
  });

  it('reports a damaged PDF honestly instead of inventing values', async () => {
    const broken = Buffer.from('%PDF-1.4\nthis is not actually a pdf body');
    const stored = await storeDocument(
      user.id,
      new File([new Uint8Array(broken)], 'broken.pdf', { type: 'application/pdf' }),
    );
    if (!stored.ok) throw new Error('setup');
    const { document, result, note } = await processDocument(stored.document, 'INR');
    expect(['failed', 'empty']).toContain(document.extractionStatus);
    expect(result).toBeNull();
    expect(note).toBeTruthy();
    expect(
      db.select().from(extractions).where(eq(extractions.documentId, document.id)).all(),
    ).toHaveLength(0);
  });

  it('reads an .eml file and uses the sender as the merchant', async () => {
    const eml = [
      'From: Zentra Support <support@zentra.example>',
      'Subject: Your refund',
      'Date: Tue, 06 Oct 2026 09:15:00 +0530',
      'Content-Type: text/plain',
      '',
      'Your refund of INR 3,799.00 has been initiated for Order No: ZE-884512.',
    ].join('\r\n');
    const stored = await storeDocument(
      user.id,
      new File([eml], 'refund.eml', { type: 'message/rfc822' }),
    );
    if (!stored.ok) throw new Error('setup');

    const { document, result } = await processDocument(stored.document, 'INR');
    expect(document.extractionEngine).toBe('eml');
    expect(result?.classification).toBe('refund_case');
    expect(result?.fields.merchant?.value).toBe('Zentra Support');
    expect(result?.fields.amountMinor?.value).toBe(379_900);
  });

  it('is honest when an image cannot be read', async () => {
    const stored = await storeDocument(
      user.id,
      new File([new Uint8Array(PNG)], 'blank.png', { type: 'image/png' }),
    );
    if (!stored.ok) throw new Error('setup');
    const { document } = await processDocument(stored.document, 'INR');
    if (ocrAvailable()) {
      // A 12-byte PNG has no readable text; OCR must fail or return nothing.
      expect(['empty', 'failed']).toContain(document.extractionStatus);
    } else {
      expect(document.extractionStatus).toBe('unsupported');
      expect(document.extractedText).toBeNull();
    }
  });
});

describe('deleting', () => {
  it('removes the row and the bytes on disk', async () => {
    const stored = await storeDocument(
      user.id,
      new File(['bye'], 'bye.txt', { type: 'text/plain' }),
    );
    if (!stored.ok) throw new Error('setup');
    const path = documentAbsolutePath(stored.document);
    expect(readFileSync(path, 'utf8')).toBe('bye');

    deleteDocument(user.id, stored.document);
    expect(
      db.select().from(documents).where(eq(documents.id, stored.document.id)).get(),
    ).toBeUndefined();
    expect(() => readFileSync(path)).toThrow();
  });

  it('will not delete a file belonging to someone else', async () => {
    const stranger = makeUser();
    const stored = await storeDocument(
      user.id,
      new File(['mine'], 'mine.txt', { type: 'text/plain' }),
    );
    if (!stored.ok) throw new Error('setup');
    deleteDocument(stranger.id, stored.document); // scoped by user id in the where clause
    expect(
      db.select().from(documents).where(eq(documents.id, stored.document.id)).get(),
    ).toBeDefined();
  });
});
