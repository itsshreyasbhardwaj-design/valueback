import { formatMoney } from '@/lib/money';
import { cn } from './ui';

/**
 * Charts are plain SVG rendered on the server: no chart library, no client
 * JavaScript, and they still read correctly with scripts disabled. Each one
 * also exposes the same data as text for screen readers.
 */

export function BarList({
  items,
  currency,
  emptyLabel = 'Nothing to show yet.',
  max: maxOverride,
}: {
  items: Array<{ label: string; value: number; note?: string; tone?: 'accent' | 'warn' | 'neutral' }>;
  currency: string;
  emptyLabel?: string;
  max?: number;
}) {
  if (items.length === 0) {
    return <p className="px-1 py-6 text-center text-sm text-[var(--text-muted)]">{emptyLabel}</p>;
  }
  const max = maxOverride ?? Math.max(...items.map((i) => i.value), 1);
  const colour = { accent: 'var(--accent)', warn: 'var(--warn)', neutral: 'var(--border-strong)' };
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium">{item.label}</span>
            <span className="nums shrink-0 tabular-nums text-[var(--text-muted)]">
              {formatMoney(item.value, currency)}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--bg-subtle)]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(2, (item.value / max) * 100)}%`,
                background: colour[item.tone ?? 'accent'],
              }}
            />
          </div>
          {item.note ? <p className="mt-0.5 text-xs text-[var(--text-faint)]">{item.note}</p> : null}
        </li>
      ))}
    </ul>
  );
}

export function CountBarList({
  items,
  emptyLabel = 'Nothing to show yet.',
}: {
  items: Array<{ label: string; value: number; tone?: 'accent' | 'warn' | 'neutral' }>;
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return <p className="px-1 py-6 text-center text-sm text-[var(--text-muted)]">{emptyLabel}</p>;
  }
  const max = Math.max(...items.map((i) => i.value), 1);
  const colour = { accent: 'var(--accent)', warn: 'var(--warn)', neutral: 'var(--border-strong)' };
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-3">
          <span className="w-40 shrink-0 truncate text-[0.8125rem]">{item.label}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg-subtle)]">
            <span
              className="block h-full rounded-full"
              style={{ width: `${Math.max(3, (item.value / max) * 100)}%`, background: colour[item.tone ?? 'accent'] }}
            />
          </span>
          <span className="nums w-8 shrink-0 text-right text-[0.8125rem] text-[var(--text-muted)]">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}

/** Two-series monthly columns (refunds vs credits), responsive via viewBox. */
export function MonthlyColumns({
  data,
  currency,
  className,
}: {
  data: Array<{ month: string; refunds: number; credits: number }>;
  currency: string;
  className?: string;
}) {
  const max = Math.max(...data.map((d) => d.refunds + d.credits), 1);
  const width = 720;
  const height = 200;
  const padX = 8;
  const padBottom = 26;
  const slot = (width - padX * 2) / Math.max(data.length, 1);
  const barW = Math.min(28, slot * 0.55);
  const usable = height - padBottom - 6;
  const empty = data.every((d) => d.refunds + d.credits === 0);

  return (
    <figure className={cn('w-full', className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-44 w-full"
        role="img"
        aria-label={`Confirmed recovery by month in ${currency}. ${data
          .filter((d) => d.refunds + d.credits > 0)
          .map((d) => `${d.month}: ${formatMoney(d.refunds + d.credits, currency)}`)
          .join('; ') || 'No recovery recorded yet.'}`}
      >
        <line
          x1={padX}
          y1={height - padBottom}
          x2={width - padX}
          y2={height - padBottom}
          stroke="var(--border)"
          strokeWidth="1"
        />
        {data.map((d, i) => {
          const total = d.refunds + d.credits;
          const h = total === 0 ? 0 : Math.max(3, (total / max) * usable);
          const refundH = total === 0 ? 0 : (d.refunds / total) * h;
          const x = padX + i * slot + (slot - barW) / 2;
          const yTop = height - padBottom - h;
          return (
            <g key={d.month}>
              {h > 0 ? (
                <>
                  <rect x={x} y={yTop} width={barW} height={refundH} rx="2" fill="var(--accent)" />
                  <rect
                    x={x}
                    y={yTop + refundH}
                    width={barW}
                    height={h - refundH}
                    rx="2"
                    fill="var(--accent)"
                    opacity="0.45"
                  />
                </>
              ) : null}
              <text
                x={x + barW / 2}
                y={height - padBottom + 15}
                textAnchor="middle"
                fontSize="10"
                fill="var(--text-faint)"
              >
                {d.month.slice(5)}
              </text>
            </g>
          );
        })}
        {empty ? (
          <text x={width / 2} y={height / 2} textAnchor="middle" fontSize="13" fill="var(--text-faint)">
            Nothing confirmed as recovered yet
          </text>
        ) : null}
      </svg>
      <figcaption className="mt-1 flex flex-wrap items-center gap-4 text-xs text-[var(--text-muted)]">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[var(--accent)]" aria-hidden /> Refunds confirmed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[var(--accent)] opacity-45" aria-hidden /> Credit recorded as used
        </span>
        <span className="ml-auto">Month shown as MM</span>
      </figcaption>
    </figure>
  );
}
