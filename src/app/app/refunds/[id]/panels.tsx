'use client';

import { useActionState, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/form';
import { Alert, Button, Field, Input, Select } from '@/components/ui';
import type { FormState } from '@/lib/validation';
import {
  addRefundReminderAction,
  archiveRefundAction,
  completeClaimActionAction,
  deleteRefundAction,
  logClaimActionAction,
  transitionRefundAction,
} from '../actions';

export function TransitionPanel({
  caseId,
  allowed,
  labels,
  today,
  currency,
  outstandingLabel,
}: {
  caseId: string;
  allowed: string[];
  labels: Record<string, string>;
  today: string;
  currency: string;
  outstandingLabel: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(transitionRefundAction, {});
  const [status, setStatus] = useState(allowed[0] ?? '');
  const needsAmount = status === 'received_confirmed' || status === 'partially_received';
  const needsReason = status === 'closed_without_receipt';

  if (allowed.length === 0) {
    return (
      <p className="p-4 text-sm text-[var(--text-muted)]">
        No further status changes are possible from here.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4 p-4 sm:p-5" noValidate>
      <input type="hidden" name="id" value={caseId} />
      <FormMessage state={state} />

      <Field label="Move this case to" name="status" required>
        <Select
          id="status"
          name="status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {allowed.map((s) => (
            <option key={s} value={s}>
              {labels[s]}
            </option>
          ))}
        </Select>
      </Field>

      {needsAmount ? (
        <>
          <Alert tone="neutral">
            Only confirm what actually reached your account. {outstandingLabel} is still outstanding
            on this case, and only the amount you enter here is counted as recovered.
          </Alert>
          <Field
            label={`Amount received now (${currency})`}
            name="receivedAmount"
            error={state.errors?.receivedAmount}
            hint={
              status === 'received_confirmed'
                ? 'Leave blank to confirm the full outstanding amount.'
                : 'The part that arrived.'
            }
            required={status === 'partially_received'}
          >
            <Input
              id="receivedAmount"
              name="receivedAmount"
              inputMode="decimal"
              className="nums"
              placeholder="1500.00"
            />
          </Field>
        </>
      ) : null}

      {needsReason ? (
        <Field
          label="Why is it being closed?"
          name="closedReason"
          error={state.errors?.closedReason}
        >
          <Input
            id="closedReason"
            name="closedReason"
            maxLength={300}
            placeholder="Merchant refused; not worth pursuing"
          />
        </Field>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="When did this happen?"
          name="occurredAt"
          required
          error={state.errors?.occurredAt}
        >
          <Input
            id="occurredAt"
            name="occurredAt"
            type="date"
            defaultValue={today}
            max={today}
            required
          />
        </Field>
        <Field label="Note for the timeline" name="note" error={state.errors?.note}>
          <Input id="note" name="note" maxLength={500} placeholder="Agent confirmed on chat" />
        </Field>
      </div>

      <SubmitButton pendingLabel="Updating…">Update this case</SubmitButton>
    </form>
  );
}

export function FollowUpDraft({ subject, body }: { subject: string; body: string }) {
  const [copied, setCopied] = useState<'none' | 'subject' | 'body'>('none');
  const [error, setError] = useState<string | null>(null);

  function copy(text: string, which: 'subject' | 'body') {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(which);
        setTimeout(() => setCopied('none'), 2000);
      },
      () =>
        setError('Your browser blocked clipboard access. Select the text and copy it manually.'),
    );
  }

  return (
    <div className="space-y-3 p-4 sm:p-5">
      <Alert tone="neutral">
        Built from the facts already on this case. It does not claim the merchant agreed to anything
        or that money was sent. No email provider is connected, so ValueBack cannot send it — copy
        it and send it yourself.
      </Alert>

      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="vb-label mb-0">Subject</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => copy(subject, 'subject')}>
            {copied === 'subject' ? (
              <Check size={13} aria-hidden />
            ) : (
              <Copy size={13} aria-hidden />
            )}
            {copied === 'subject' ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <p className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm">
          {subject}
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="vb-label mb-0">Message</p>
          <Button type="button" variant="secondary" size="sm" onClick={() => copy(body, 'body')}>
            {copied === 'body' ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
            {copied === 'body' ? 'Copied' : 'Copy message'}
          </Button>
        </div>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-[0.8125rem] leading-relaxed">
          {body}
        </pre>
      </div>

      {error ? (
        <p role="alert" className="text-xs text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ClaimActionPanel({
  caseId,
  members,
}: {
  caseId: string;
  members: Array<{ id: string; label: string }>;
}) {
  const [state, action] = useActionState<FormState, FormData>(logClaimActionAction, {});
  return (
    <form action={action} className="space-y-3 p-4" noValidate>
      <input type="hidden" name="refundCaseId" value={caseId} />
      <FormMessage state={state} />
      <Field label="What did you do?" name="kind">
        <Select id="kind" name="kind" defaultValue="emailed">
          <option value="emailed">Sent an email</option>
          <option value="called">Called them</option>
          <option value="chat">Used their chat</option>
          <option value="follow_up_drafted">Drafted a follow-up</option>
          <option value="escalated">Escalated it</option>
          <option value="note">Just a note</option>
        </Select>
      </Field>
      <Field label="Summary" name="summary" required error={state.errors?.summary}>
        <Input
          id="summary"
          name="summary"
          maxLength={500}
          required
          placeholder="Chased on chat, told to wait 5 more days"
        />
      </Field>
      {members.length > 1 ? (
        <Field label="Assign the next step to" name="assigneeUserId">
          <Select id="assigneeUserId" name="assigneeUserId" defaultValue="">
            <option value="">Nobody in particular</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field label="Next step due" name="dueAt">
        <Input id="dueAt" name="dueAt" type="date" />
      </Field>
      <SubmitButton variant="secondary" size="sm" pendingLabel="Saving…">
        Log this
      </SubmitButton>
    </form>
  );
}

export function CompleteActionButton({ actionId, caseId }: { actionId: string; caseId: string }) {
  const [, action] = useActionState<FormState, FormData>(completeClaimActionAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="actionId" value={actionId} />
      <input type="hidden" name="refundCaseId" value={caseId} />
      <SubmitButton variant="ghost" size="sm" pendingLabel="…">
        Mark done
      </SubmitButton>
    </form>
  );
}

export function RefundReminderPanel({ caseId, today }: { caseId: string; today: string }) {
  const [state, action] = useActionState<FormState, FormData>(addRefundReminderAction, {});
  return (
    <form action={action} className="space-y-3 p-4" noValidate>
      <input type="hidden" name="refundCaseId" value={caseId} />
      <input type="hidden" name="kind" value="follow_up" />
      <FormMessage state={state} />
      <Field label="Remind me to" name="label" required error={state.errors?.label}>
        <Input id="label" name="label" maxLength={120} required placeholder="Chase this again" />
      </Field>
      <Field label="On" name="dueAt" required error={state.errors?.dueAt}>
        <Input id="dueAt" name="dueAt" type="date" min={today} defaultValue={today} required />
      </Field>
      <SubmitButton variant="secondary" size="sm" pendingLabel="Scheduling…">
        Add reminder
      </SubmitButton>
    </form>
  );
}

export function RefundDangerZone({
  caseId,
  archived,
  isOwner,
}: {
  caseId: string;
  archived: boolean;
  isOwner: boolean;
}) {
  const [archiveState, archiveAction] = useActionState<FormState, FormData>(
    archiveRefundAction,
    {},
  );
  const [deleteState, deleteAction] = useActionState<FormState, FormData>(deleteRefundAction, {});
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-3 p-4">
      <FormMessage state={archiveState} />
      <form action={archiveAction}>
        <input type="hidden" name="id" value={caseId} />
        <input type="hidden" name="archive" value={archived ? '0' : '1'} />
        <SubmitButton variant="secondary" size="sm" pendingLabel="Working…">
          {archived ? 'Restore this case' : 'Archive this case'}
        </SubmitButton>
      </form>

      {isOwner ? (
        !open ? (
          <Button type="button" variant="danger" size="sm" onClick={() => setOpen(true)}>
            Delete permanently
          </Button>
        ) : (
          <form action={deleteAction} className="space-y-3" noValidate>
            <input type="hidden" name="id" value={caseId} />
            <Alert tone="danger" title="This cannot be undone">
              The case, its timeline and its follow-ups go. Any amount you already confirmed
              receiving stays in your recovery history, because that happened.
            </Alert>
            <FormMessage state={deleteState} />
            <Field
              label="Type delete to confirm"
              name="confirm"
              required
              error={deleteState.errors?.confirm}
            >
              <Input id="confirm" name="confirm" placeholder="delete" autoComplete="off" required />
            </Field>
            <div className="flex gap-2">
              <SubmitButton variant="danger" size="sm" pendingLabel="Deleting…">
                Delete this case
              </SubmitButton>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )
      ) : null}
    </div>
  );
}
