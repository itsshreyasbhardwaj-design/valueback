'use client';

import { useActionState, useState } from 'react';
import { Copy, Eye, EyeOff, Loader2 } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/form';
import { Alert, Badge, Button, Field, Input, Select, Textarea } from '@/components/ui';
import type { FormState } from '@/lib/validation';
import {
  addBenefitReminderAction,
  deleteBenefitAction,
  recordBalanceAction,
  revealCodeAction,
  revokeShareAction,
  setStatusAction,
  shareBenefitAction,
} from '../actions';

const EVENT_TYPES = [
  { value: 'usage', label: 'I used some of it', help: 'Counts towards confirmed recovered value.' },
  {
    value: 'redeemed',
    label: 'I used all of it',
    help: 'Closes the record and counts the remainder as recovered.',
  },
  {
    value: 'verified_update',
    label: 'I checked the real balance',
    help: 'Records what the provider says today. Not counted as recovered — a balance you did not spend is not value you got back.',
  },
  {
    value: 'correction',
    label: 'Fix a mistake I made',
    help: 'Corrects the record. Not counted as recovered.',
  },
  {
    value: 'revalidation',
    label: 'The expiry moved',
    help: 'Records an extension and reschedules the reminders.',
  },
] as const;

export function BalancePanel({
  benefitId,
  currency,
  today,
  hasUnits,
  unitLabel,
}: {
  benefitId: string;
  currency: string;
  today: string;
  hasUnits: boolean;
  unitLabel: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(recordBalanceAction, {});
  const [type, setType] = useState<string>('usage');
  const chosen = EVENT_TYPES.find((t) => t.value === type)!;
  const showAmount = type !== 'redeemed' && type !== 'revalidation';

  return (
    <form action={action} className="space-y-4 p-4 sm:p-5" noValidate>
      <input type="hidden" name="id" value={benefitId} />
      <FormMessage state={state} />

      <Field label="What happened?" name="type" required>
        <Select id="type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
          {EVENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </Field>
      <p className="-mt-2 text-xs text-[var(--text-faint)]">{chosen.help}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        {showAmount ? (
          <Field
            label={type === 'usage' ? `Amount used (${currency})` : `New balance (${currency})`}
            name="amount"
            error={state.errors?.amount}
          >
            <Input
              id="amount"
              name="amount"
              inputMode="decimal"
              placeholder="500.00"
              className="nums"
            />
          </Field>
        ) : null}

        {showAmount && hasUnits ? (
          <Field
            label={
              type === 'usage'
                ? `${unitLabel || 'Units'} used`
                : `${unitLabel || 'Units'} remaining`
            }
            name="units"
            error={state.errors?.units}
          >
            <Input id="units" name="units" inputMode="numeric" placeholder="1" className="nums" />
          </Field>
        ) : null}

        {type === 'revalidation' ? (
          <Field label="New expiry date" name="newExpiresAt" error={state.errors?.newExpiresAt}>
            <Input id="newExpiresAt" name="newExpiresAt" type="date" />
          </Field>
        ) : null}

        <Field label="When" name="occurredAt" required error={state.errors?.occurredAt}>
          <Input
            id="occurredAt"
            name="occurredAt"
            type="date"
            defaultValue={today}
            max={today}
            required
          />
        </Field>
      </div>

      <Field
        label="Reason or note"
        name="reason"
        hint="Kept on the record forever — it is how the history stays readable."
        error={state.errors?.reason}
      >
        <Textarea
          id="reason"
          name="reason"
          rows={2}
          maxLength={500}
          placeholder="Spent at the Koramangala store"
        />
      </Field>

      <SubmitButton pendingLabel="Recording…">Record it</SubmitButton>
    </form>
  );
}

export function StatusControl({
  benefitId,
  current,
  allowed,
  labels,
}: {
  benefitId: string;
  current: string;
  allowed: string[];
  labels: Record<string, string>;
}) {
  const [state, action] = useActionState<FormState, FormData>(setStatusAction, {});
  if (allowed.length === 0) {
    return (
      <p className="p-4 text-sm text-[var(--text-muted)]">
        No status changes are available from “{labels[current]}”.
      </p>
    );
  }
  return (
    <form action={action} className="space-y-3 p-4">
      <input type="hidden" name="id" value={benefitId} />
      <FormMessage state={state} />
      <Field label="Change status to" name="status">
        <Select id="status" name="status" defaultValue={allowed[0]}>
          {allowed.map((s) => (
            <option key={s} value={s}>
              {labels[s]}
            </option>
          ))}
        </Select>
      </Field>
      <SubmitButton variant="secondary" size="sm" pendingLabel="Updating…">
        Update status
      </SubmitButton>
    </form>
  );
}

export function CodeReveal({ benefitId, hint }: { benefitId: string; hint: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function reveal() {
    setBusy(true);
    setError(null);
    const result = await revealCodeAction(benefitId);
    setBusy(false);
    if (result.ok && result.code) setCode(result.code);
    else setError(result.error ?? 'Could not read the code.');
  }

  return (
    <div>
      <p className="font-mono text-sm">{code ?? hint}</p>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-[var(--danger)]">
          {error}
        </p>
      ) : null}
      <div className="mt-2 flex gap-2">
        {code ? (
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                void navigator.clipboard?.writeText(code).then(
                  () => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  },
                  () =>
                    setError(
                      'Your browser blocked clipboard access. Select the code and copy it manually.',
                    ),
                );
              }}
            >
              <Copy size={14} aria-hidden /> {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setCode(null)}>
              <EyeOff size={14} aria-hidden /> Hide
            </Button>
          </>
        ) : (
          <Button type="button" variant="secondary" size="sm" onClick={reveal} disabled={busy}>
            {busy ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <Eye size={14} aria-hidden />
            )}
            {busy ? 'Decrypting…' : 'Reveal code'}
          </Button>
        )}
      </div>
      <p className="mt-2 text-xs text-[var(--text-faint)]">
        Stored encrypted with AES-256-GCM. Revealing it is recorded in the audit log; the code
        itself never is.
      </p>
    </div>
  );
}

export function SharePanel({
  resourceId,
  resourceType,
  households,
  grants,
  isOwner,
}: {
  resourceId: string;
  resourceType: 'benefit' | 'refund_case';
  households: Array<{ id: string; name: string }>;
  grants: Array<{ householdId: string; householdName: string; permission: string }>;
  isOwner: boolean;
}) {
  const [shareState, shareAction] = useActionState<FormState, FormData>(shareBenefitAction, {});
  const [revokeState, revokeAction] = useActionState<FormState, FormData>(revokeShareAction, {});

  if (!isOwner) {
    return (
      <p className="p-4 text-sm text-[var(--text-muted)]">
        This record was shared with you. Only its owner can change who else can see it.
      </p>
    );
  }
  if (households.length === 0) {
    return (
      <p className="p-4 text-sm text-[var(--text-muted)]">
        You are not in a household yet. Create one to share selected records with someone else.
      </p>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <FormMessage state={shareState} />
      <FormMessage state={revokeState} />

      {grants.length > 0 ? (
        <ul className="space-y-2">
          {grants.map((g) => (
            <li
              key={g.householdId}
              className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2"
            >
              <span className="text-sm">
                {g.householdName}{' '}
                <Badge tone="info">{g.permission === 'edit' ? 'Can edit' : 'View only'}</Badge>
              </span>
              <form action={revokeAction}>
                <input type="hidden" name="resourceId" value={resourceId} />
                <input type="hidden" name="resourceType" value={resourceType} />
                <input type="hidden" name="householdId" value={g.householdId} />
                <SubmitButton variant="ghost" size="sm" pendingLabel="Removing…">
                  Stop sharing
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">Not shared with anyone.</p>
      )}

      <form action={shareAction} className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <input type="hidden" name="resourceId" value={resourceId} />
        <input type="hidden" name="resourceType" value={resourceType} />
        <Field label="Share with household" name="householdId">
          <Select id="householdId" name="householdId" defaultValue={households[0]?.id}>
            {households.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="They can" name="permission">
          <Select id="permission" name="permission" defaultValue="view">
            <option value="view">View only</option>
            <option value="edit">View and edit</option>
          </Select>
        </Field>
        <SubmitButton size="sm" pendingLabel="Sharing…">
          Share
        </SubmitButton>
      </form>

      <p className="text-xs text-[var(--text-faint)]">
        Sharing a record does not transfer the benefit itself. A card that the provider says is
        non-transferable stays that way.
      </p>
    </div>
  );
}

export function ReminderPanel({ benefitId, today }: { benefitId: string; today: string }) {
  const [state, action] = useActionState<FormState, FormData>(addBenefitReminderAction, {});
  return (
    <form action={action} className="space-y-3 p-4" noValidate>
      <input type="hidden" name="benefitId" value={benefitId} />
      <input type="hidden" name="kind" value="custom" />
      <FormMessage state={state} />
      <Field label="Remind me to" name="label" required error={state.errors?.label}>
        <Input
          id="label"
          name="label"
          maxLength={120}
          placeholder="Use this before the trip"
          required
        />
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

export function DangerZone({ benefitId, isOwner }: { benefitId: string; isOwner: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(deleteBenefitAction, {});
  const [open, setOpen] = useState(false);

  if (!isOwner) return null;
  return (
    <div className="p-4">
      {!open ? (
        <Button type="button" variant="danger" size="sm" onClick={() => setOpen(true)}>
          Delete permanently
        </Button>
      ) : (
        <form action={action} className="space-y-3" noValidate>
          <input type="hidden" name="id" value={benefitId} />
          <Alert tone="danger" title="This cannot be undone">
            Deleting removes the record, its entire balance history and its reminders. Archiving
            keeps the history and takes it out of your active list instead.
          </Alert>
          <FormMessage state={state} />
          <Field
            label="Type delete to confirm"
            name="confirm"
            required
            error={state.errors?.confirm}
          >
            <Input id="confirm" name="confirm" autoComplete="off" placeholder="delete" required />
          </Field>
          <div className="flex gap-2">
            <SubmitButton variant="danger" size="sm" pendingLabel="Deleting…">
              Delete this record
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
