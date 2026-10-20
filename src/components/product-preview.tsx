'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Wallet } from 'lucide-react';
import { Badge } from './ui';

/**
 * Marketing preview only. Every number below is invented for illustration and
 * is labelled as such on screen — it never touches the database and no real
 * account ever shows it.
 */
const EXAMPLE = {
  metrics: [
    { label: 'Available, as reported', value: '₹18,400', note: 'across 7 records', tone: 'neutral' as const },
    { label: 'Pending refunds', value: '₹4,299', note: '2 cases open', tone: 'neutral' as const },
    { label: 'Expiring in 30 days', value: '₹5,000', note: 'slice of the first figure', tone: 'warning' as const },
    { label: 'Confirmed recovered', value: '₹11,750', note: 'you confirmed each one', tone: 'positive' as const },
  ],
  attention: [
    {
      title: 'Lifestyle Store credit note',
      reason: 'Recorded expiry is in 6 days and this has not been marked as used.',
      amount: '₹2,500',
      tone: 'danger' as const,
      tag: 'Expires 26 Oct',
    },
    {
      title: 'Refund from Zentra Electronics',
      reason: 'The refund window you recorded ended 4 days ago and you have not confirmed receiving the money.',
      amount: '₹3,799',
      tone: 'danger' as const,
      tag: 'Overdue',
    },
    {
      title: 'Yoga studio class pack',
      reason: '4 of 10 sessions remain and the pack expires next month.',
      amount: '4 sessions',
      tone: 'warning' as const,
      tag: 'Prepaid',
    },
  ],
  activity: [
    { title: 'Refund received from Marigold Travel', amount: '+₹6,450', when: '12 Oct', kind: 'Refund confirmed' },
    { title: 'Used gift card at Bluebird Books', amount: '+₹1,800', when: '28 Sep', kind: 'Credit recorded as used' },
    { title: 'Cashback credited by card issuer', amount: '+₹3,500', when: '14 Sep', kind: 'Credit recorded as used' },
  ],
};

const TABS = [
  { id: 'overview', label: 'Overview', icon: Wallet },
  { id: 'attention', label: 'Needs attention', icon: AlertTriangle },
  { id: 'activity', label: 'Recovery activity', icon: CheckCircle2 },
] as const;

export function ProductPreview() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('overview');

  return (
    <div className="vb-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
        <div role="tablist" aria-label="Product preview" className="flex gap-1 overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                id={`preview-tab-${t.id}`}
                aria-selected={active}
                aria-controls={`preview-panel-${t.id}`}
                onClick={() => setTab(t.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium ${
                  active
                    ? 'bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-card)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                <Icon size={14} aria-hidden />
                {t.label}
              </button>
            );
          })}
        </div>
        <Badge tone="info" className="shrink-0">Example data</Badge>
      </div>

      <div className="p-3 sm:p-4">
        {tab === 'overview' ? (
          <div role="tabpanel" id="preview-panel-overview" aria-labelledby="preview-tab-overview" className="grid gap-3 sm:grid-cols-2">
            {EXAMPLE.metrics.map((m) => (
              <div key={m.label} className="rounded-lg border border-[var(--border)] p-3">
                <p className="text-[0.75rem] font-medium text-[var(--text-muted)]">{m.label}</p>
                <p
                  className={`nums mt-1 text-xl font-semibold ${
                    m.tone === 'positive' ? 'text-[var(--accent)]' : m.tone === 'warning' ? 'text-[var(--warn)]' : ''
                  }`}
                >
                  {m.value}
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-faint)]">{m.note}</p>
              </div>
            ))}
          </div>
        ) : null}

        {tab === 'attention' ? (
          <ul role="tabpanel" id="preview-panel-attention" aria-labelledby="preview-tab-attention" className="space-y-2">
            {EXAMPLE.attention.map((a) => (
              <li key={a.title} className="rounded-lg border border-[var(--border)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold">{a.title}</p>
                  <Badge tone={a.tone}>{a.tag}</Badge>
                </div>
                <p className="mt-1 text-[0.8125rem] text-[var(--text-muted)]">{a.reason}</p>
                <p className="nums mt-1.5 text-sm font-semibold">{a.amount}</p>
              </li>
            ))}
          </ul>
        ) : null}

        {tab === 'activity' ? (
          <ul role="tabpanel" id="preview-panel-activity" aria-labelledby="preview-tab-activity" className="space-y-2">
            {EXAMPLE.activity.map((a) => (
              <li key={a.title} className="flex items-start justify-between gap-3 rounded-lg border border-[var(--border)] p-3">
                <div>
                  <p className="text-sm font-semibold">{a.title}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--text-faint)]">
                    <Clock size={12} aria-hidden /> {a.when} · {a.kind}
                  </p>
                </div>
                <p className="nums shrink-0 text-sm font-semibold text-[var(--accent)]">{a.amount}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <p className="border-t border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-xs text-[var(--text-faint)]">
        Illustration with invented records. A new account starts empty.
      </p>
    </div>
  );
}
