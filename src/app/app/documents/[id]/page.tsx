import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { Download, FileWarning, Lightbulb, ScanLine } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { benefits, refundCases } from '@/lib/db/schema';
import { getDocumentFor, NotFoundError } from '@/lib/authz';
import { latestExtraction, parseExtraction } from '@/lib/documents';
import { confidenceNote, suggestedActions, type Confidence } from '@/lib/extraction';
import { parseOffsets } from '@/lib/reminders';
import { CATEGORY_LABELS, timestamp } from '@/lib/format';
import { minorToDecimalString } from '@/lib/money';
import { Alert, Badge, Card, CardHeader, LinkButton, PageHeader } from '@/components/ui';
import { BenefitForm, type BenefitFormValues } from '../../benefits/benefit-form';
import { createBenefitAction } from '../../benefits/actions';
import { RefundForm, type RefundFormValues } from '../../refunds/refund-form';
import { createRefundAction } from '../../refunds/actions';
import { AttachPanel, DeleteDocumentPanel, ReprocessButton } from './panels';

export const metadata: Metadata = { title: 'Review document' };

const CONFIDENCE_TONE: Record<Confidence, 'positive' | 'warning' | 'danger'> = {
  high: 'positive',
  medium: 'warning',
  low: 'danger',
};

export default async function DocumentReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const as = typeof sp.as === 'string' ? sp.as : null;

  let doc;
  try {
    doc = getDocumentFor(user.id, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const extraction = latestExtraction(doc.id);
  const result = extraction ? parseExtraction(extraction) : null;
  const fields = result?.fields ?? {};
  const classification = result?.classification ?? null;
  const looksLikeRefund = classification === 'refund_case';
  const currency = fields.currency?.value ?? user.settings.currency;

  const proposals: Array<{
    label: string;
    display: string;
    confidence: Confidence;
    evidence: string;
  }> = [];
  const push = (
    label: string,
    value: string | undefined,
    p?: { confidence: Confidence; evidence: string },
  ) => {
    if (value && p)
      proposals.push({ label, display: value, confidence: p.confidence, evidence: p.evidence });
  };
  push('Title', fields.title?.value, fields.title);
  push('Merchant', fields.merchant?.value, fields.merchant);
  push(
    'Amount',
    fields.amountMinor
      ? `${currency} ${minorToDecimalString(fields.amountMinor.value, currency)}`
      : undefined,
    fields.amountMinor,
  );
  push('Currency', fields.currency?.value, fields.currency);
  push('Order reference', fields.orderRef?.value, fields.orderRef);
  push('Issued on', fields.issuedAt?.value, fields.issuedAt);
  push('Expires on', fields.expiresAt?.value, fields.expiresAt);
  push('Refund expected by', fields.expectedByDate?.value, fields.expectedByDate);
  push('Redemption code', fields.code ? '•••• (hidden until you save it)' : undefined, fields.code);
  push('Conditions', fields.conditions?.value, fields.conditions);

  const attachOptions = [
    ...db
      .select({ id: benefits.id, title: benefits.title })
      .from(benefits)
      .where(and(eq(benefits.userId, user.id), isNull(benefits.archivedAt)))
      .orderBy(desc(benefits.updatedAt))
      .limit(25)
      .all()
      .map((b) => ({ value: `benefit:${b.id}`, label: `Benefit — ${b.title}` })),
    ...db
      .select({ id: refundCases.id, merchant: refundCases.merchant })
      .from(refundCases)
      .where(and(eq(refundCases.userId, user.id), isNull(refundCases.archivedAt)))
      .orderBy(desc(refundCases.updatedAt))
      .limit(25)
      .all()
      .map((r) => ({ value: `refund_case:${r.id}`, label: `Refund — ${r.merchant}` })),
  ];

  const benefitPrefill: BenefitFormValues = {
    title: fields.title?.value?.slice(0, 120) ?? '',
    category: classification && classification !== 'refund_case' ? classification : 'gift_card',
    merchant: fields.merchant?.value?.slice(0, 80) ?? '',
    currency,
    originalValue: fields.amountMinor
      ? minorToDecimalString(fields.amountMinor.value, currency)
      : '',
    currentValue: '',
    unitLabel: '',
    units: '',
    issuedAt: fields.issuedAt?.value ?? '',
    receivedAt: '',
    expiresAt: fields.expiresAt?.value ?? '',
    conditions: fields.conditions?.value ?? '',
    notes: `Read from ${doc.filename} on ${doc.createdAt.slice(0, 10)}.`,
    tags: '',
    recurrence: 'none',
    recurrenceUnits: '',
    recurrenceAnchor: '',
  };

  const refundPrefill: RefundFormValues = {
    merchant: fields.merchant?.value?.slice(0, 80) ?? '',
    orderRef: fields.orderRef?.value ?? '',
    referenceNumber: '',
    currency,
    amount: fields.amountMinor ? minorToDecimalString(fields.amountMinor.value, currency) : '',
    purchaseDate: fields.issuedAt?.value ?? '',
    initiatedAt: '',
    expectedByDate: fields.expectedByDate?.value ?? '',
    method: '',
    notes: `Read from ${doc.filename} on ${doc.createdAt.slice(0, 10)}.`,
  };

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-[var(--text-muted)]">
        <Link href="/app/documents" className="hover:underline">
          Documents
        </Link>
        <span aria-hidden> / </span>
        <span className="text-[var(--text)]">{doc.filename}</span>
      </nav>

      {typeof sp.duplicate === 'string' ? (
        <Alert tone="warning" title="You have uploaded this exact file before" className="mb-4">
          The contents are byte-for-byte identical to{' '}
          <Link href={`/app/documents/${sp.duplicate}`} className="underline">
            another document
          </Link>
          . Both are kept — ValueBack will not merge or delete anything for you.
        </Alert>
      ) : null}

      <PageHeader
        title="Review what was read"
        description="Nothing below has been saved. Check each value, correct anything wrong, then create the record."
      />

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          <Card>
            <CardHeader
              title="Suggestions"
              description={
                classification
                  ? `This looks like ${looksLikeRefund ? 'a refund case' : CATEGORY_LABELS[classification].toLowerCase()}.`
                  : 'The type could not be determined from the wording.'
              }
              action={
                <Badge tone={doc.extractionStatus === 'ok' ? 'positive' : 'warning'}>
                  {doc.extractionEngine === 'none' ? 'not read' : doc.extractionEngine}
                </Badge>
              }
            />

            {doc.extractionStatus !== 'ok' ? (
              <div className="p-4 sm:p-5">
                <Alert tone="warning" title="No text could be read from this file">
                  {doc.extractionStatus === 'unsupported'
                    ? 'Text recognition is not available for this file type on this machine.'
                    : doc.extractionStatus === 'empty'
                      ? 'The file opened but contained no selectable text. A scanned PDF usually needs to be saved as an image first.'
                      : 'The file could not be read. It may be damaged or password protected.'}{' '}
                  You can still enter the details by hand below.
                </Alert>
              </div>
            ) : proposals.length === 0 ? (
              <div className="p-4 sm:p-5">
                <Alert tone="neutral" title="Text was read, but nothing recognisable was found">
                  No amounts, dates or references matched the parsing rules. Fill the form in by
                  hand — the document stays attached as evidence.
                </Alert>
              </div>
            ) : (
              <>
                <ul className="divide-y divide-[var(--border)]">
                  {proposals.map((p) => (
                    <li key={p.label} className="px-4 py-3 sm:px-5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-[0.8125rem] text-[var(--text-muted)]">{p.label}</span>
                        <span className="font-medium">{p.display}</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <Badge
                          tone={CONFIDENCE_TONE[p.confidence]}
                          title={confidenceNote(p.confidence)}
                        >
                          {p.confidence} confidence
                        </Badge>
                        <span className="text-xs text-[var(--text-faint)]">“{p.evidence}”</span>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="border-t border-[var(--border)] px-4 py-2.5 text-xs text-[var(--text-faint)] sm:px-5">
                  Confidence is a label, not a probability. It reflects how clearly the value was
                  labelled in the document — nothing more.
                </p>
              </>
            )}
          </Card>

          {result && result.classificationReasons.length > 0 ? (
            <Card className="p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <ScanLine size={15} className="text-[var(--accent)]" aria-hidden /> Why it was
                classified this way
              </p>
              <ul className="mt-2 space-y-1 text-[0.8125rem] text-[var(--text-muted)]">
                {result.classificationReasons.map((r) => (
                  <li key={r}>— The text {r}.</li>
                ))}
              </ul>
            </Card>
          ) : null}

          {result ? (
            <Card className="p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Lightbulb size={15} className="text-[var(--accent)]" aria-hidden /> Suggested next
                steps
              </p>
              <ul className="mt-2 space-y-1 text-[0.8125rem] text-[var(--text-muted)]">
                {suggestedActions(result).map((s) => (
                  <li key={s}>— {s}</li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Create a record from this"
              description="You can also just keep the file as evidence."
            />
            <div className="flex flex-wrap gap-2 p-4">
              <LinkButton
                href={`/app/documents/${doc.id}?as=benefit`}
                size="sm"
                variant={as === 'benefit' ? 'primary' : 'secondary'}
              >
                Create a benefit
              </LinkButton>
              <LinkButton
                href={`/app/documents/${doc.id}?as=refund`}
                size="sm"
                variant={as === 'refund' ? 'primary' : 'secondary'}
              >
                Create a refund case
              </LinkButton>
              {as ? (
                <LinkButton href={`/app/documents/${doc.id}`} size="sm" variant="ghost">
                  Cancel
                </LinkButton>
              ) : null}
            </div>
            {!as && looksLikeRefund ? (
              <p className="px-4 pb-4 text-[0.8125rem] text-[var(--text-muted)]">
                The wording points at a refund. “Create a refund case” sets up the follow-up
                tracking.
              </p>
            ) : null}
          </Card>

          {as === 'benefit' ? (
            <div>
              <h2 className="mb-3 text-base font-semibold">Check these values, then save</h2>
              <BenefitForm
                action={createBenefitAction}
                initial={benefitPrefill}
                mode="create"
                reminderOffsets={parseOffsets(user.settings.reminderOffsets)}
                documentId={doc.id}
                evidence="document_extracted"
              />
            </div>
          ) : null}

          {as === 'refund' ? (
            <div>
              <h2 className="mb-3 text-base font-semibold">Check these values, then save</h2>
              <RefundForm
                action={createRefundAction}
                initial={refundPrefill}
                mode="create"
                documentId={doc.id}
              />
            </div>
          ) : null}
        </div>

        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader
              title="The document"
              description={`${doc.mime} · ${(doc.sizeBytes / 1024).toFixed(0)} KB`}
            />
            <div className="p-4">
              {doc.mime.startsWith('image/') ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={`/api/documents/${doc.id}/file`}
                  alt={`Uploaded document: ${doc.filename}`}
                  className="max-h-96 w-full rounded-lg border border-[var(--border)] object-contain"
                />
              ) : doc.mime === 'application/pdf' ? (
                <object
                  data={`/api/documents/${doc.id}/file`}
                  type="application/pdf"
                  className="h-96 w-full rounded-lg border border-[var(--border)]"
                >
                  <p className="p-4 text-sm text-[var(--text-muted)]">
                    Your browser cannot display this PDF inline.{' '}
                    <a href={`/api/documents/${doc.id}/file`} className="underline">
                      Open it instead
                    </a>
                    .
                  </p>
                </object>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">
                  This file type has no visual preview. The text read from it is below.
                </p>
              )}
              <a
                href={`/api/documents/${doc.id}/file`}
                className="mt-3 inline-flex items-center gap-1.5 text-sm text-[var(--accent)] hover:underline"
              >
                <Download size={14} aria-hidden /> Open the original
              </a>
              <p className="mt-2 text-xs text-[var(--text-faint)]">
                Uploaded {timestamp(doc.createdAt, { dateFormat: user.settings.dateFormat })}
              </p>
            </div>
          </Card>

          {doc.extractedText ? (
            <Card>
              <details open>
                <summary className="cursor-pointer px-4 py-3 text-[0.9375rem] font-semibold">
                  Text that was read
                </summary>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap border-t border-[var(--border)] px-4 py-3 text-xs leading-relaxed text-[var(--text-muted)]">
                  {doc.extractedText.slice(0, 8000)}
                </pre>
              </details>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Attach to a record" />
            <AttachPanel documentId={doc.id} options={attachOptions} />
          </Card>

          <Card className="p-4">
            <ReprocessButton documentId={doc.id} />
            <p className="mt-2 text-xs text-[var(--text-faint)]">
              Useful after setting up text recognition, or if the parsing rules improve.
            </p>
          </Card>

          <Card>
            <CardHeader
              title="Remove"
              action={<FileWarning size={15} className="text-[var(--text-faint)]" aria-hidden />}
            />
            <DeleteDocumentPanel documentId={doc.id} />
          </Card>
        </div>
      </div>
    </>
  );
}
