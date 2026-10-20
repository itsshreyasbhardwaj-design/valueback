import { formatMoney } from '@/lib/money';
import type { Metric } from '@/lib/analytics';
import { Explain } from './ui';

function primaryAmount(m: Metric, currency: string): number {
  return m.byCurrency[currency] ?? 0;
}

function otherCurrencies(m: Metric, currency: string): Array<[string, number]> {
  return Object.entries(m.byCurrency).filter(([c, v]) => c !== currency && v !== 0);
}

export function MetricCard({
  metric,
  currency,
  href,
}: {
  metric: Metric;
  currency: string;
  href?: string;
}) {
  const amount = primaryAmount(metric, currency);
  const others = otherCurrencies(metric, currency);
  const tone =
    metric.tone === 'positive'
      ? 'text-[var(--accent)]'
      : metric.tone === 'warning'
        ? 'text-[var(--warn)]'
        : 'text-[var(--text)]';

  const body = (
    <>
      <div className="flex items-start gap-1">
        <p className="text-[0.75rem] font-medium leading-tight text-[var(--text-muted)]">
          {metric.label}
          <Explain>{metric.description}</Explain>
        </p>
      </div>
      <p className={`nums mt-1.5 text-[1.375rem] font-semibold leading-none ${tone}`}>
        {formatMoney(amount, currency)}
      </p>
      <p className="mt-1.5 text-xs text-[var(--text-faint)]">
        {metric.subsetOf ? 'part of the figure above · ' : ''}
        {metric.count} {metric.count === 1 ? 'record' : 'records'}
      </p>
      {others.length > 0 ? (
        <p className="mt-1 text-xs text-[var(--text-faint)]">
          also {others.map(([c, v]) => formatMoney(v, c)).join(', ')} — kept separate, no conversion rate
        </p>
      ) : null}
    </>
  );

  const className = `vb-card block p-3.5 ${href ? 'transition-colors hover:border-[var(--border-strong)]' : ''}`;
  return href ? (
    <a href={href} className={className}>
      {body}
    </a>
  ) : (
    <div className={className}>{body}</div>
  );
}

export function StatTile({
  label,
  value,
  note,
  explain,
}: {
  label: string;
  value: string | number;
  note?: string;
  explain?: string;
}) {
  return (
    <div className="vb-card p-3.5">
      <p className="text-[0.75rem] font-medium text-[var(--text-muted)]">
        {label}
        {explain ? <Explain>{explain}</Explain> : null}
      </p>
      <p className="nums mt-1.5 text-[1.375rem] font-semibold leading-none">{value}</p>
      {note ? <p className="mt-1.5 text-xs text-[var(--text-faint)]">{note}</p> : null}
    </div>
  );
}
