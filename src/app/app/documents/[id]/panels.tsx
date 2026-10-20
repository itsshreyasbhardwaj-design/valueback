'use client';

import { useActionState, useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/form';
import { Alert, Button, Field, Select } from '@/components/ui';
import type { FormState } from '@/lib/validation';
import { attachDocumentAction, deleteDocumentAction, reprocessDocumentAction } from '../actions';

export function ReprocessButton({ documentId }: { documentId: string }) {
  const [state, action] = useActionState<FormState, FormData>(reprocessDocumentAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={documentId} />
      <SubmitButton variant="secondary" size="sm" pendingLabel="Reading again…">
        <RefreshCw size={13} aria-hidden /> Read this file again
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function AttachPanel({
  documentId,
  options,
}: {
  documentId: string;
  options: Array<{ value: string; label: string }>;
}) {
  const [state, action] = useActionState<FormState, FormData>(attachDocumentAction, {});
  if (options.length === 0) {
    return (
      <p className="p-4 text-sm text-[var(--text-muted)]">
        You have no records to attach this to yet.
      </p>
    );
  }
  return (
    <form action={action} className="space-y-3 p-4" noValidate>
      <input type="hidden" name="id" value={documentId} />
      <FormMessage state={state} />
      <Field label="Attach to an existing record" name="target" error={state.errors?.target}>
        <Select id="target" name="target" defaultValue={options[0]?.value}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <SubmitButton variant="secondary" size="sm" pendingLabel="Attaching…">
        Attach
      </SubmitButton>
    </form>
  );
}

export function DeleteDocumentPanel({ documentId }: { documentId: string }) {
  const [state, action] = useActionState<FormState, FormData>(deleteDocumentAction, {});
  const [open, setOpen] = useState(false);
  return (
    <div className="p-4">
      {!open ? (
        <Button type="button" variant="danger" size="sm" onClick={() => setOpen(true)}>
          <Trash2 size={13} aria-hidden /> Delete this document
        </Button>
      ) : (
        <form action={action} className="space-y-3">
          <input type="hidden" name="id" value={documentId} />
          <Alert tone="danger" title="This removes the file from disk">
            Records created from it keep their values — only the evidence goes.
          </Alert>
          <FormMessage state={state} />
          <div className="flex gap-2">
            <SubmitButton variant="danger" size="sm" pendingLabel="Deleting…">
              Delete permanently
            </SubmitButton>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
