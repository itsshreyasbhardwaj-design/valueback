'use client';

import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { BellRing, Check, Clock, X } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/form';
import { Alert, Button, Field, Input, Select } from '@/components/ui';
import type { FormState } from '@/lib/validation';
import {
  cancelReminderAction,
  completeReminderAction,
  createReminderAction,
  markNotificationReadAction,
  rescheduleReminderAction,
  runSchedulerAction,
  snoozeReminderAction,
} from './actions';

export function ReminderActions({ reminderId, dueAt }: { reminderId: string; dueAt: string }) {
  const [, snooze] = useActionState<FormState, FormData>(snoozeReminderAction, {});
  const [, complete] = useActionState<FormState, FormData>(completeReminderAction, {});
  const [, cancel] = useActionState<FormState, FormData>(cancelReminderAction, {});
  const [, reschedule] = useActionState<FormState, FormData>(rescheduleReminderAction, {});
  const [showDate, setShowDate] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <form action={snooze}>
        <input type="hidden" name="id" value={reminderId} />
        <input type="hidden" name="days" value="7" />
        <SubmitButton variant="ghost" size="sm" pendingLabel="…">
          <Clock size={13} aria-hidden /> Snooze 7d
        </SubmitButton>
      </form>
      <form action={complete}>
        <input type="hidden" name="id" value={reminderId} />
        <SubmitButton variant="ghost" size="sm" pendingLabel="…">
          <Check size={13} aria-hidden /> Done
        </SubmitButton>
      </form>
      {showDate ? (
        <form action={reschedule} className="flex items-end gap-1.5">
          <input type="hidden" name="id" value={reminderId} />
          <input
            type="date"
            name="dueAt"
            defaultValue={dueAt}
            className="vb-input h-8 w-36 py-0 text-xs"
            aria-label="New date"
          />
          <SubmitButton variant="secondary" size="sm" pendingLabel="…">
            Move
          </SubmitButton>
        </form>
      ) : (
        <Button type="button" variant="ghost" size="sm" onClick={() => setShowDate(true)}>
          Reschedule
        </Button>
      )}
      <form action={cancel}>
        <input type="hidden" name="id" value={reminderId} />
        <SubmitButton variant="ghost" size="sm" pendingLabel="…">
          <X size={13} aria-hidden /> Cancel
        </SubmitButton>
      </form>
    </div>
  );
}

export function MarkReadButton({ notificationId }: { notificationId: string }) {
  const [, action] = useActionState<FormState, FormData>(markNotificationReadAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="id" value={notificationId} />
      <SubmitButton variant="ghost" size="sm" pendingLabel="…">
        Mark read
      </SubmitButton>
    </form>
  );
}

export function RunSchedulerPanel() {
  const [state, action] = useActionState<FormState, FormData>(runSchedulerAction, {});
  return (
    <form action={action} className="space-y-2 p-4">
      <SubmitButton variant="secondary" size="sm" pendingLabel="Checking…">
        <BellRing size={13} aria-hidden /> Check for due reminders now
      </SubmitButton>
      <FormMessage state={state} />
      <p className="text-xs text-[var(--text-faint)]">
        Reminders are also checked automatically while you use the app, and by{' '}
        <code className="font-mono">npm run reminders:run</code> from the project folder.
      </p>
    </form>
  );
}

export function NewReminderPanel({ today }: { today: string }) {
  const [state, action] = useActionState<FormState, FormData>(createReminderAction, {});
  return (
    <form action={action} className="space-y-3 p-4" noValidate>
      <input type="hidden" name="kind" value="custom" />
      <FormMessage state={state} />
      <Field label="Remind me to" name="label" required error={state.errors?.label}>
        <Input
          id="label"
          name="label"
          maxLength={120}
          required
          placeholder="Ask the gym about the unused sessions"
        />
      </Field>
      <Field label="On" name="dueAt" required error={state.errors?.dueAt}>
        <Input id="dueAt" name="dueAt" type="date" min={today} defaultValue={today} required />
      </Field>
      <SubmitButton size="sm" pendingLabel="Scheduling…">
        Add reminder
      </SubmitButton>
    </form>
  );
}

/**
 * Browser notifications only work while this tab is open and only after the
 * person grants permission. We say so rather than implying push delivery.
 *
 * Permission is read through useSyncExternalStore so the server render and the
 * first client render agree, and so a grant updates the UI without an effect.
 */
const notificationStore = {
  subscribe(onChange: () => void) {
    window.addEventListener('vb:notification-permission', onChange);
    return () => window.removeEventListener('vb:notification-permission', onChange);
  },
  getSnapshot(): NotificationPermission | 'unsupported' {
    return typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported';
  },
  getServerSnapshot(): NotificationPermission | 'unsupported' | 'unknown' {
    return 'unknown';
  },
};

export function BrowserNotifications({
  enabled,
  pending,
}: {
  enabled: boolean;
  pending: Array<{ title: string; body: string }>;
}) {
  const permission = useSyncExternalStore(
    notificationStore.subscribe,
    notificationStore.getSnapshot,
    notificationStore.getServerSnapshot,
  );
  const shown = useRef(false);

  useEffect(() => {
    if (!enabled || shown.current || permission !== 'granted' || pending.length === 0) return;
    shown.current = true;
    for (const n of pending.slice(0, 3)) {
      try {
        new Notification(n.title, { body: n.body, tag: n.title });
      } catch {
        // Some browsers refuse constructor notifications; nothing to recover.
      }
    }
  }, [enabled, permission, pending]);

  if (!enabled || permission === 'unknown') return null;
  if (permission === 'unsupported') {
    return <Alert tone="neutral">This browser does not support notifications.</Alert>;
  }
  if (permission === 'granted') {
    return (
      <Alert tone="positive">
        Browser notifications are on for this browser. They appear while a ValueBack tab is open —
        nothing is delivered once the app is closed.
      </Alert>
    );
  }
  if (permission === 'denied') {
    return (
      <Alert tone="warning">
        This browser has blocked notifications for ValueBack. Change it in your browser&rsquo;s site
        settings if you want them.
      </Alert>
    );
  }
  return (
    <Alert tone="neutral" title="Browser notifications are not switched on yet">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="mt-2"
        onClick={() => {
          void Notification.requestPermission().then(() =>
            window.dispatchEvent(new Event('vb:notification-permission')),
          );
        }}
      >
        Allow notifications in this browser
      </Button>
    </Alert>
  );
}

export function SnoozeSelect({ reminderId }: { reminderId: string }) {
  const [, action] = useActionState<FormState, FormData>(snoozeReminderAction, {});
  return (
    <form action={action} className="flex items-end gap-2">
      <input type="hidden" name="id" value={reminderId} />
      <Field label="Snooze for" name="days">
        <Select id="days" name="days" defaultValue="7">
          <option value="1">1 day</option>
          <option value="3">3 days</option>
          <option value="7">7 days</option>
          <option value="14">14 days</option>
          <option value="30">30 days</option>
        </Select>
      </Field>
      <SubmitButton variant="secondary" size="sm" pendingLabel="…">
        Snooze
      </SubmitButton>
    </form>
  );
}
