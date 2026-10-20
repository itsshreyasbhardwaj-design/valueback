import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getBenefitFor, ForbiddenError, NotFoundError } from '@/lib/authz';
import { distinctMerchants } from '@/lib/benefits';
import { parseOffsets } from '@/lib/reminders';
import { moneyInput, parseTags } from '@/lib/format';
import { PageHeader } from '@/components/ui';
import { BenefitForm } from '../../benefit-form';
import { updateBenefitAction } from '../../actions';

export const metadata: Metadata = { title: 'Edit benefit' };

export default async function EditBenefitPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  let benefit;
  try {
    ({ benefit } = getBenefitFor(user.id, id, 'edit'));
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof ForbiddenError) notFound();
    throw err;
  }

  const merchants = distinctMerchants(user.id);

  return (
    <>
      <PageHeader title="Edit benefit" description="Balances are changed from the record page so the history stays intact." />
      <datalist id="merchant-hints">
        {merchants.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <BenefitForm
        action={updateBenefitAction}
        mode="edit"
        reminderOffsets={parseOffsets(user.settings.reminderOffsets)}
        initial={{
          id: benefit.id,
          title: benefit.title,
          category: benefit.category,
          merchant: benefit.merchant,
          currency: benefit.currency,
          originalValue: moneyInput(benefit.originalValueMinor, benefit.currency),
          currentValue: moneyInput(benefit.currentValueMinor, benefit.currency),
          unitLabel: benefit.unitLabel ?? '',
          units: benefit.currentUnits?.toString() ?? '',
          issuedAt: benefit.issuedAt ?? '',
          receivedAt: benefit.receivedAt ?? '',
          expiresAt: benefit.expiresAt ?? '',
          conditions: benefit.conditions,
          notes: benefit.notes,
          tags: parseTags(benefit.tags).join(', '),
          codeHint: benefit.codeHint,
          recurrence: benefit.recurrence,
          recurrenceUnits: benefit.recurrenceUnits?.toString() ?? '',
          recurrenceAnchor: benefit.recurrenceAnchor ?? '',
        }}
      />
    </>
  );
}
