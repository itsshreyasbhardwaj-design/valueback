'use client';

import { useActionState, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/form';
import { Field } from '@/components/ui';
import type { FormState } from '@/lib/validation';
import { uploadDocumentAction } from './actions';

export function UploadPanel({
  accept,
  maxLabel,
  benefitId,
  refundCaseId,
  ocrAvailable,
}: {
  accept: string;
  maxLabel: string;
  benefitId?: string;
  refundCaseId?: string;
  ocrAvailable: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(uploadDocumentAction, {});
  const [name, setName] = useState<string | null>(null);

  return (
    <form action={action} className="space-y-3 p-4 sm:p-5" noValidate>
      {benefitId ? <input type="hidden" name="benefitId" value={benefitId} /> : null}
      {refundCaseId ? <input type="hidden" name="refundCaseId" value={refundCaseId} /> : null}
      <FormMessage state={state} />

      <Field
        label="Choose a file"
        name="file"
        required
        error={state.errors?.file}
        hint={`JPG, PNG, WEBP, PDF, TXT or EML, up to ${maxLabel}. ${
          ocrAvailable
            ? 'Photos are read with on-device text recognition.'
            : 'Image text recognition is not set up on this machine, so photos are stored but not read.'
        }`}
      >
        <input
          id="file"
          name="file"
          type="file"
          accept={accept}
          required
          onChange={(e) => setName(e.target.files?.[0]?.name ?? null)}
          className="vb-input file:mr-3 file:rounded-md file:border-0 file:bg-[var(--accent-soft)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[var(--accent-soft-text)]"
        />
      </Field>

      {name ? <p className="text-xs text-[var(--text-muted)]">Selected: {name}</p> : null}

      <SubmitButton pendingLabel="Uploading and reading…">
        <UploadCloud size={15} aria-hidden /> Upload and read
      </SubmitButton>
      <p className="text-xs text-[var(--text-faint)]">
        Reading happens on this machine. Nothing is sent to another service, and nothing is saved to
        a record until you confirm it.
      </p>
    </form>
  );
}
