import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { Alert, PageHeader } from '@/components/ui';
import { RefundForm, type RefundFormValues } from '../refund-form';
import { createRefundAction } from '../actions';

export const metadata: Metadata = { title: 'Track a refund' };

export default async function NewRefundPage() {
  const user = await requireUser();
  const initial: RefundFormValues = {
    merchant: '',
    orderRef: '',
    referenceNumber: '',
    currency: user.settings.currency,
    amount: '',
    purchaseDate: '',
    initiatedAt: '',
    expectedByDate: '',
    method: '',
    notes: '',
  };
  return (
    <>
      <PageHeader
        title="Track a refund"
        description="Open a case the day you ask for the money back. ValueBack watches the window and nudges you if it passes."
      />
      <Alert tone="neutral" className="mb-5">
        The case starts at “return or cancellation requested”. Nothing is counted as money you got
        back until you confirm it arrived.
      </Alert>
      <RefundForm action={createRefundAction} initial={initial} mode="create" />
    </>
  );
}
