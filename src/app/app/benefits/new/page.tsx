import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { parseOffsets } from '@/lib/reminders';
import { checkBenefitLimit } from '@/lib/entitlements';
import { distinctMerchants } from '@/lib/benefits';
import { Alert, PageHeader } from '@/components/ui';
import { BenefitForm, type BenefitFormValues } from '../benefit-form';
import { createBenefitAction } from '../actions';

export const metadata: Metadata = { title: 'Add a benefit' };

export default async function NewBenefitPage() {
  const user = await requireUser();
  const limit = checkBenefitLimit(user.id, user.plan);
  const merchants = distinctMerchants(user.id);

  return (
    <>
      <PageHeader
        title="Add a benefit"
        description="Gift cards, store credits, coupons, prepaid packs — anything you have already paid for or are owed."
      />
      {!limit.allowed ? (
        <Alert tone="warning" title="You have reached your plan limit" className="mb-5">
          {limit.message}
        </Alert>
      ) : null}
      <datalist id="merchant-hints">
        {merchants.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <BenefitForm
        action={createBenefitAction}
        initial={emptyBenefit(user.settings.currency)}
        mode="create"
        reminderOffsets={parseOffsets(user.settings.reminderOffsets)}
      />
    </>
  );
}

/** Blank form values. Lives here (a server module) so it can be built on the server. */
function emptyBenefit(currency: string): BenefitFormValues {
  return {
    title: '',
    category: 'gift_card',
    merchant: '',
    currency,
    originalValue: '',
    currentValue: '',
    unitLabel: '',
    units: '',
    issuedAt: '',
    receivedAt: '',
    expiresAt: '',
    conditions: '',
    notes: '',
    tags: '',
    recurrence: 'none',
    recurrenceUnits: '',
    recurrenceAnchor: '',
  };
}
