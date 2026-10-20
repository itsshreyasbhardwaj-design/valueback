import 'server-only';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { mkdirSync, rmSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { db } from './db';
import { documents, extractions } from './db/schema';
import { sha256 } from './crypto';
import { newId } from './ids';
import { analyseText, type ExtractionResult } from './extraction';
import { looksLikeEml, parseEml } from './eml';
import { ocrAvailable, ocrImage, OCR_UNAVAILABLE_MESSAGE } from './ocr';
import { audit } from './audit';
import { readEnv } from './env';

export const UPLOAD_MAX_BYTES = 8 * 1024 * 1024; // 8 MB
export const UPLOAD_MAX_LABEL = '8 MB';

export const ACCEPTED_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.pdf',
  '.txt',
  '.eml',
] as const;
export const ACCEPT_ATTRIBUTE =
  '.jpg,.jpeg,.png,.webp,.pdf,.txt,.eml,image/jpeg,image/png,image/webp,application/pdf,text/plain,message/rfc822';

export type Document = typeof documents.$inferSelect;
export type Extraction = typeof extractions.$inferSelect;

export function storageDir(): string {
  return resolve(readEnv('STORAGE_DIR') ?? './storage');
}

type Sniffed = { kind: 'image' | 'pdf' | 'text' | 'eml'; mime: string; ext: string };

/**
 * Decide what a file actually is from its bytes, not from what the browser
 * claimed. An extension or Content-Type alone is attacker-controlled.
 */
export function sniffType(buf: Buffer, filename: string): Sniffed | { error: string } {
  const ext = (/\.[a-z0-9]+$/i.exec(filename)?.[0] ?? '').toLowerCase();

  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { kind: 'image', mime: 'image/png', ext: '.png' };
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { kind: 'image', mime: 'image/jpeg', ext: '.jpg' };
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return { kind: 'image', mime: 'image/webp', ext: '.webp' };
  }
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') {
    return { kind: 'pdf', mime: 'application/pdf', ext: '.pdf' };
  }

  // Text-ish: must decode as UTF-8 without control-character noise.
  const head = buf.subarray(0, 4096);
  const text = head.toString('utf8');
  const suspicious = /[\u0000-\u0008\u000E-\u001F]/.test(text);
  if (!suspicious && (ext === '.txt' || ext === '.eml' || ext === '')) {
    const whole = buf.toString('utf8');
    if (ext === '.eml' || looksLikeEml(whole)) {
      return { kind: 'eml', mime: 'message/rfc822', ext: '.eml' };
    }
    return { kind: 'text', mime: 'text/plain', ext: '.txt' };
  }

  return {
    error:
      'That file type is not supported. Upload a JPG, PNG, WEBP, PDF, TXT or EML file. The file contents are checked, not just the name.',
  };
}

export type StoreResult =
  { ok: true; document: Document; duplicateOfId: string | null } | { ok: false; error: string };

export async function storeDocument(
  userId: string,
  file: File,
  link?: { benefitId?: string | null; refundCaseId?: string | null },
): Promise<StoreResult> {
  if (file.size === 0) return { ok: false, error: 'That file is empty.' };
  if (file.size > UPLOAD_MAX_BYTES) {
    return {
      ok: false,
      error: `Files must be ${UPLOAD_MAX_LABEL} or smaller. This one is ${(file.size / 1e6).toFixed(1)} MB.`,
    };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffType(buf, file.name);
  if ('error' in sniffed) return { ok: false, error: sniffed.error };

  const hash = sha256(buf);
  const existing = db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.userId, userId), eq(documents.sha256, hash)))
    .get();

  const id = newId('d_');
  // One file per document row. Content-addressing would save disk on repeat
  // uploads, but then deleting one record could pull the file out from under
  // another. ponytail: duplicate bytes are cheaper than a refcount bug.
  const relPath = `${userId}/${id}${sniffed.ext}`;
  const abs = resolve(storageDir(), relPath);
  mkdirSync(dirname(abs), { recursive: true, mode: 0o700 });
  await writeFile(abs, buf, { mode: 0o600 });

  db.insert(documents)
    .values({
      id,
      userId,
      benefitId: link?.benefitId ?? null,
      refundCaseId: link?.refundCaseId ?? null,
      filename: file.name.replace(/[\r\n]/g, '').slice(0, 200),
      mime: sniffed.mime,
      sizeBytes: buf.length,
      sha256: hash,
      storagePath: relPath,
      extractionStatus: 'pending',
    })
    .run();

  audit(userId, 'document.upload', 'document', id, {
    mime: sniffed.mime,
    sizeBytes: buf.length > 0 ? 1 : 0,
  });
  return {
    ok: true,
    document: db.select().from(documents).where(eq(documents.id, id)).get()!,
    duplicateOfId: existing?.id ?? null,
  };
}

export function documentAbsolutePath(doc: Pick<Document, 'storagePath'>): string {
  const abs = resolve(storageDir(), doc.storagePath);
  // Defence against a crafted storagePath escaping the storage root.
  if (!abs.startsWith(storageDir())) throw new Error('Invalid document path');
  return abs;
}

export async function readDocumentBytes(doc: Pick<Document, 'storagePath'>): Promise<Buffer> {
  return readFile(documentAbsolutePath(doc));
}

/* ------------------------------------------------------ text extraction */

export type TextResult = {
  text: string;
  engine: 'none' | 'text' | 'pdfjs' | 'ocr' | 'eml';
  status: 'ok' | 'empty' | 'failed' | 'unsupported';
  note?: string;
  context?: { merchant?: string; date?: string; subject?: string };
};

export async function extractTextFromPdf(data: Buffer): Promise<TextResult> {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = pdfjs.getDocument({
      data: new Uint8Array(data),
      useSystemFonts: false,
      // pdf.js concatenates this with a filename, so the trailing separator
      // is load-bearing: without it every standard-font lookup fails and the
      // whole document read throws.
      standardFontDataUrl: `${resolve(process.cwd(), 'node_modules/pdfjs-dist/standard_fonts')}/`,
    });
    const doc = await task.promise;
    const pages: string[] = [];
    const limit = Math.min(doc.numPages, 20); // guard against a 500-page upload
    for (let i = 1; i <= limit; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
          .replace(/\s+/g, ' '),
      );
    }
    await task.destroy();
    const text = pages.join('\n').trim();
    return text
      ? { text, engine: 'pdfjs', status: 'ok' }
      : {
          text: '',
          engine: 'pdfjs',
          status: 'empty',
          note: 'This PDF has no selectable text — it is probably a scan. Save it as an image and upload that to use text recognition, or enter the details by hand.',
        };
  } catch (err) {
    // The reason is useful to whoever runs the server; the document's contents
    // are never logged.
    console.warn(
      '[valueback] PDF read failed:',
      err instanceof Error ? err.message : 'unknown error',
    );
    return {
      text: '',
      engine: 'pdfjs',
      status: 'failed',
      note: 'This PDF could not be read. It may be damaged or password protected.',
    };
  }
}

export async function extractTextFor(doc: Document, bytes: Buffer): Promise<TextResult> {
  if (doc.mime === 'application/pdf') return extractTextFromPdf(bytes);

  if (doc.mime === 'message/rfc822') {
    const parsed = parseEml(bytes.toString('utf8'));
    const text = [parsed.subject, parsed.text].filter(Boolean).join('\n');
    return {
      text,
      engine: 'eml',
      status: text.trim() ? 'ok' : 'empty',
      context: {
        merchant: parsed.fromName || parsed.fromDomain.split('.')[0] || undefined,
        date: parsed.date ?? undefined,
        subject: parsed.subject || undefined,
      },
    };
  }

  if (doc.mime === 'text/plain') {
    const text = bytes.toString('utf8').trim();
    return { text, engine: 'text', status: text ? 'ok' : 'empty' };
  }

  if (doc.mime.startsWith('image/')) {
    if (!ocrAvailable()) {
      return { text: '', engine: 'none', status: 'unsupported', note: OCR_UNAVAILABLE_MESSAGE };
    }
    const result = await ocrImage(bytes);
    if (!result.ok) return { text: '', engine: 'ocr', status: 'failed', note: result.error };
    const text = result.text.trim();
    return {
      text,
      engine: 'ocr',
      status: text ? 'ok' : 'empty',
      note: text
        ? 'Read with on-device text recognition — check the values carefully.'
        : 'No text could be read from this image.',
    };
  }

  return { text: '', engine: 'none', status: 'unsupported' };
}

/**
 * Full pipeline: read bytes -> extract text -> classify -> propose fields.
 * Proposals land in `extractions`, never on a benefit: the review screen is the
 * only path from a suggestion to a saved value.
 */
export async function processDocument(
  doc: Document,
  defaultCurrency: string,
): Promise<{
  document: Document;
  extraction: Extraction | null;
  result: ExtractionResult | null;
  note?: string;
}> {
  const bytes = await readDocumentBytes(doc);
  const textResult = await extractTextFor(doc, bytes);

  db.update(documents)
    .set({
      extractedText: textResult.text || null,
      extractionEngine: textResult.engine,
      extractionStatus: textResult.status,
    })
    .where(eq(documents.id, doc.id))
    .run();

  const updated = db.select().from(documents).where(eq(documents.id, doc.id)).get()!;
  if (textResult.status !== 'ok') {
    return { document: updated, extraction: null, result: null, note: textResult.note };
  }

  const result = analyseText(textResult.text, {
    defaultCurrency,
    context: textResult.context,
  });

  const id = newId('x_');
  db.insert(extractions)
    .values({
      id,
      documentId: doc.id,
      classification: result.classification,
      classificationScore: result.classificationScore,
      proposedJson: JSON.stringify(result),
    })
    .run();

  return {
    document: updated,
    extraction: db.select().from(extractions).where(eq(extractions.id, id)).get()!,
    result,
    note: textResult.note,
  };
}

export function latestExtraction(documentId: string): Extraction | null {
  return (
    db
      .select()
      .from(extractions)
      .where(eq(extractions.documentId, documentId))
      .orderBy(desc(extractions.createdAt))
      .get() ?? null
  );
}

export function parseExtraction(row: Extraction): ExtractionResult | null {
  try {
    return JSON.parse(row.proposedJson) as ExtractionResult;
  } catch {
    return null;
  }
}

export function markExtractionReviewed(id: string, accepted: Record<string, unknown>) {
  db.update(extractions)
    .set({ reviewedAt: new Date().toISOString(), acceptedJson: JSON.stringify(accepted) })
    .where(eq(extractions.id, id))
    .run();
}

export function listDocuments(userId: string, limit = 100) {
  return db
    .select()
    .from(documents)
    .where(eq(documents.userId, userId))
    .orderBy(desc(documents.createdAt))
    .limit(limit)
    .all();
}

export function documentsFor(opts: { benefitId?: string; refundCaseId?: string }) {
  const where = opts.benefitId
    ? eq(documents.benefitId, opts.benefitId)
    : eq(documents.refundCaseId, opts.refundCaseId!);
  return db.select().from(documents).where(where).orderBy(desc(documents.createdAt)).all();
}

export function linkDocument(
  documentId: string,
  link: { benefitId?: string | null; refundCaseId?: string | null },
) {
  db.update(documents).set(link).where(eq(documents.id, documentId)).run();
}

/** Deletes the row and the bytes on disk. Used by document management + account deletion. */
export function deleteDocument(userId: string, doc: Document): void {
  try {
    rmSync(documentAbsolutePath(doc), { force: true });
  } catch {
    // the row still goes; a stale file is worse than an orphaned one
  }
  db.delete(documents)
    .where(and(eq(documents.id, doc.id), eq(documents.userId, userId)))
    .run();
  audit(userId, 'document.delete', 'document', doc.id, {});
}

export function documentsThisMonth(userId: string): number {
  const since = `${new Date().toISOString().slice(0, 7)}-01`;
  return (
    db
      .select({ n: sql<number>`count(*)` })
      .from(documents)
      .where(and(eq(documents.userId, userId), gte(documents.createdAt, since)))
      .get()?.n ?? 0
  );
}

export function storageUsedBytes(userId: string): number {
  return (
    db
      .select({ n: sql<number>`coalesce(sum(${documents.sizeBytes}), 0)` })
      .from(documents)
      .where(eq(documents.userId, userId))
      .get()?.n ?? 0
  );
}
