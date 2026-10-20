import type { Metadata } from 'next';
import Link from 'next/link';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { FileText, Image as ImageIcon, Mail } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { benefits, refundCases } from '@/lib/db/schema';
import {
  ACCEPT_ATTRIBUTE,
  UPLOAD_MAX_LABEL,
  documentsThisMonth,
  listDocuments,
  storageUsedBytes,
} from '@/lib/documents';
import { ocrAvailable, OCR_UNAVAILABLE_MESSAGE } from '@/lib/ocr';
import { PLAN_LIMITS } from '@/lib/entitlements';
import { duplicateDocumentCount } from '@/lib/duplicates';
import { timestamp } from '@/lib/format';
import { Alert, Badge, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui';
import { UploadPanel } from './upload-panel';

export const metadata: Metadata = { title: 'Documents' };

const ICONS: Record<string, typeof FileText> = {
  'application/pdf': FileText,
  'message/rfc822': Mail,
  'text/plain': FileText,
};

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const prefs = { dateFormat: user.settings.dateFormat };
  const benefitId = typeof sp.benefitId === 'string' ? sp.benefitId : undefined;
  const refundCaseId = typeof sp.refundCaseId === 'string' ? sp.refundCaseId : undefined;

  const docs = listDocuments(user.id, 200);
  const used = documentsThisMonth(user.id);
  const limit = PLAN_LIMITS[user.plan].documentsPerMonth;
  const bytes = storageUsedBytes(user.id);
  const dupes = duplicateDocumentCount(user.id);
  const ocr = ocrAvailable();

  const attachTarget = benefitId
    ? db
        .select({ title: benefits.title })
        .from(benefits)
        .where(and(eq(benefits.id, benefitId), eq(benefits.userId, user.id)))
        .get()
    : refundCaseId
      ? db
          .select({ title: refundCases.merchant })
          .from(refundCases)
          .where(and(eq(refundCases.id, refundCaseId), eq(refundCases.userId, user.id)))
          .get()
      : null;

  const unlinked = db
    .select()
    .from(benefits)
    .where(and(eq(benefits.userId, user.id), isNull(benefits.archivedAt)))
    .orderBy(desc(benefits.updatedAt))
    .limit(1)
    .all();

  return (
    <>
      <PageHeader
        title="Documents"
        description="Upload a receipt, confirmation email or photo. Text is extracted on this machine and turned into suggestions you confirm."
      />

      {!ocr ? (
        <Alert tone="warning" title="Image text recognition is off" className="mb-5">
          {OCR_UNAVAILABLE_MESSAGE} PDFs, text files and .eml emails are read without it.
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title={attachTarget ? `Attach to “${attachTarget.title}”` : 'Upload a document'}
              description={`${used} of ${limit} uploads used this month on the ${PLAN_LIMITS[user.plan].label} plan.`}
            />
            <UploadPanel
              accept={ACCEPT_ATTRIBUTE}
              maxLabel={UPLOAD_MAX_LABEL}
              benefitId={benefitId}
              refundCaseId={refundCaseId}
              ocrAvailable={ocr}
            />
          </Card>

          <Card className="mt-5">
            <CardHeader
              title="Your documents"
              description={`${docs.length} stored · ${(bytes / 1e6).toFixed(1)} MB on disk.`}
            />
            {docs.length === 0 ? (
              <EmptyState
                icon={<FileText size={26} aria-hidden />}
                title="No documents yet"
                description="A photo of a gift card or the confirmation email for a return is the fastest way to add a record."
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {docs.map((d) => {
                  const Icon = ICONS[d.mime] ?? ImageIcon;
                  return (
                    <li key={d.id}>
                      <Link
                        href={`/app/documents/${d.id}`}
                        className="flex items-start gap-3 px-4 py-3 hover:bg-[var(--bg-subtle)] sm:px-5"
                      >
                        <Icon
                          size={16}
                          className="mt-0.5 shrink-0 text-[var(--text-faint)]"
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{d.filename}</p>
                          <p className="mt-0.5 text-xs text-[var(--text-faint)]">
                            {timestamp(d.createdAt, prefs)} · {(d.sizeBytes / 1024).toFixed(0)} KB ·{' '}
                            {d.extractionEngine === 'none' ? 'not read' : d.extractionEngine}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Badge
                            tone={
                              d.extractionStatus === 'ok'
                                ? 'positive'
                                : d.extractionStatus === 'pending'
                                  ? 'neutral'
                                  : 'warning'
                            }
                          >
                            {d.extractionStatus === 'ok' ? 'Text read' : d.extractionStatus}
                          </Badge>
                          {d.benefitId || d.refundCaseId ? (
                            <Badge tone="info">Attached</Badge>
                          ) : null}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-4">
            <h2 className="text-sm font-semibold">What gets read</h2>
            <ul className="mt-2 space-y-1.5 text-[0.8125rem] text-[var(--text-muted)]">
              <li>• PDF — text layer, up to 20 pages. A scanned PDF has no text to read.</li>
              <li>• TXT and EML — read directly; an email also gives its sender and date.</li>
              <li>
                • JPG, PNG, WEBP — on-device text recognition{ocr ? '' : ' (not set up yet)'}.
              </li>
            </ul>
            <p className="mt-3 text-xs text-[var(--text-faint)]">
              Files are checked by their actual bytes, so renaming something to .pdf will not get it
              past the validator.
            </p>
          </Card>

          {dupes > 0 ? (
            <Alert tone="warning" title="Identical files uploaded more than once">
              {dupes} {dupes === 1 ? 'file appears' : 'files appear'} more than once by content
              hash. Open a document to see which record it belongs to, and delete the spare if you
              want.
            </Alert>
          ) : null}

          <Card className="p-4">
            <h2 className="text-sm font-semibold">Privacy</h2>
            <p className="mt-2 text-[0.8125rem] leading-relaxed text-[var(--text-muted)]">
              Uploads are written outside the public web folder and served only through an
              authorised route that re-checks who you are on every request. They are never sent
              anywhere else.
            </p>
          </Card>

          {unlinked.length > 0 ? (
            <Card className="p-4">
              <h2 className="text-sm font-semibold">Tip</h2>
              <p className="mt-2 text-[0.8125rem] text-[var(--text-muted)]">
                Open a benefit or refund case and use “Attach” there to upload straight onto that
                record.
              </p>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
