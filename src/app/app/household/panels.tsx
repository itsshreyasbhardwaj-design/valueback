'use client';

import { useActionState, useState } from 'react';
import { Check, Copy, UserPlus } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/form';
import { Alert, Button, Field, Input, Select } from '@/components/ui';
import type { FormState } from '@/lib/validation';
import {
  acceptInviteAction,
  createHouseholdAction,
  createInviteAction,
  deleteHouseholdAction,
  leaveHouseholdAction,
  removeMemberAction,
  revokeInviteAction,
} from './actions';

export function CreateHouseholdPanel() {
  const [state, action] = useActionState<FormState, FormData>(createHouseholdAction, {});
  return (
    <form action={action} className="space-y-3 p-4" noValidate>
      <FormMessage state={state} />
      <Field label="Household name" name="name" required error={state.errors?.name}>
        <Input id="name" name="name" maxLength={80} required placeholder="Our flat" />
      </Field>
      <SubmitButton size="sm" pendingLabel="Creating…">
        Create a household
      </SubmitButton>
    </form>
  );
}

export function InvitePanel({ householdId, baseUrl }: { householdId: string; baseUrl: string }) {
  const [state, action] = useActionState<FormState, FormData>(createInviteAction, {});
  const [copied, setCopied] = useState(false);
  const token = typeof state.payload?.token === 'string' ? state.payload.token : null;
  const link = token ? `${baseUrl}/app/household?invite=${token}` : null;

  return (
    <div className="space-y-3 p-4">
      <form action={action} className="flex flex-wrap items-end gap-3" noValidate>
        <input type="hidden" name="householdId" value={householdId} />
        <Field label="Invite someone as" name="role">
          <Select id="role" name="role" defaultValue="member">
            <option value="member">Member — can act on records shared with them</option>
            <option value="viewer">Viewer — can only look</option>
          </Select>
        </Field>
        <SubmitButton size="sm" pendingLabel="Creating…">
          <UserPlus size={14} aria-hidden /> Create invitation
        </SubmitButton>
      </form>

      <FormMessage state={state} />

      {link ? (
        <Alert tone="positive" title="Copy this link now — it is shown once">
          <p className="mt-1 break-all rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-xs">
            {link}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() => {
              void navigator.clipboard?.writeText(link).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              });
            }}
          >
            {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
            {copied ? 'Copied' : 'Copy the link'}
          </Button>
          <p className="mt-2 text-xs">
            Only a hash of this code is stored, so it cannot be recovered from the database. Send it the
            way you would send any password — there is no email provider to send it for you. The person
            needs a ValueBack account first.
          </p>
        </Alert>
      ) : null}
    </div>
  );
}

export function AcceptInvitePanel({ prefill }: { prefill?: string }) {
  const [state, action] = useActionState<FormState, FormData>(acceptInviteAction, {});
  return (
    <form action={action} className="space-y-3 p-4" noValidate>
      <FormMessage state={state} />
      <Field
        label="Invitation code"
        name="token"
        required
        error={state.errors?.token}
        hint="Paste the code, or the whole link — it is checked on the server."
      >
        <Input id="token" name="token" defaultValue={prefill} required className="font-mono text-xs" autoComplete="off" />
      </Field>
      <SubmitButton size="sm" pendingLabel="Checking…">
        Join this household
      </SubmitButton>
    </form>
  );
}

export function RevokeInviteButton({ inviteId }: { inviteId: string }) {
  const [, action] = useActionState<FormState, FormData>(revokeInviteAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="inviteId" value={inviteId} />
      <SubmitButton variant="ghost" size="sm" pendingLabel="…">
        Revoke
      </SubmitButton>
    </form>
  );
}

export function RemoveMemberButton({ householdId, memberUserId }: { householdId: string; memberUserId: string }) {
  const [state, action] = useActionState<FormState, FormData>(removeMemberAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="memberUserId" value={memberUserId} />
      <SubmitButton variant="ghost" size="sm" pendingLabel="…">
        Remove
      </SubmitButton>
      {state.errors?._form ? <p className="text-xs text-[var(--danger)]">{state.errors._form}</p> : null}
    </form>
  );
}

export function LeaveHouseholdButton({ householdId }: { householdId: string }) {
  const [state, action] = useActionState<FormState, FormData>(leaveHouseholdAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="householdId" value={householdId} />
      <SubmitButton variant="secondary" size="sm" pendingLabel="Leaving…">
        Leave this household
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function DeleteHouseholdPanel({ householdId }: { householdId: string }) {
  const [state, action] = useActionState<FormState, FormData>(deleteHouseholdAction, {});
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button type="button" variant="danger" size="sm" onClick={() => setOpen(true)}>
        Delete this household
      </Button>
    );
  }
  return (
    <form action={action} className="space-y-3" noValidate>
      <input type="hidden" name="householdId" value={householdId} />
      <Alert tone="danger" title="Everyone loses access immediately">
        Members are removed and every share inside this household is revoked. Your own records are not
        deleted — only the sharing.
      </Alert>
      <FormMessage state={state} />
      <Field label="Type delete to confirm" name="confirm" required error={state.errors?.confirm}>
        <Input id="confirm" name="confirm" placeholder="delete" autoComplete="off" required />
      </Field>
      <div className="flex gap-2">
        <SubmitButton variant="danger" size="sm" pendingLabel="Deleting…">
          Delete the household
        </SubmitButton>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
