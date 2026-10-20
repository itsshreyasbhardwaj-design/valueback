/** Calendar dates are 'YYYY-MM-DD' strings; instants are ISO-8601 UTC strings. */

export type IsoDate = string;

export function todayIso(timeZone = 'UTC'): IsoDate {
  // en-CA gives YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** b - a, in whole days. Negative when b is before a. */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export function monthKey(date: IsoDate): string {
  return date.slice(0, 7);
}

export function formatDate(
  date: IsoDate | null | undefined,
  fmt: 'dd/MM/yyyy' | 'MM/dd/yyyy' | 'yyyy-MM-dd' = 'dd/MM/yyyy',
): string {
  if (!date || !isIsoDate(date)) return '—';
  const [y, m, d] = date.split('-') as [string, string, string];
  if (fmt === 'yyyy-MM-dd') return date;
  if (fmt === 'MM/dd/yyyy') return `${m}/${d}/${y}`;
  return `${d}/${m}/${y}`;
}

/**
 * Best-effort parse of a date found in a document. Deliberately conservative:
 * ambiguous forms get the day-first reading (the product's default locale is
 * en-IN) and the caller surfaces it as a *suggestion* the user must confirm.
 */
export function parseLooseDate(input: string, today: IsoDate = todayIso()): IsoDate | null {
  const s = input.trim().toLowerCase().replace(/(\d+)(st|nd|rd|th)\b/g, '$1');
  if (!s) return null;

  const iso = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(s);
  if (iso) return clamp(iso[1]!, iso[2]!, iso[3]!);

  const months: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };
  // "12 Mar 2026" / "12 March 2026"
  const dmy = /\b(\d{1,2})\s+([a-z]{3,9})\.?,?\s+(\d{4})\b/.exec(s);
  if (dmy && months[dmy[2]!.slice(0, 3)]) {
    return clamp(dmy[3]!, String(months[dmy[2]!.slice(0, 3)]), dmy[1]!);
  }
  // "Mar 12, 2026"
  const mdy = /\b([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/.exec(s);
  if (mdy && months[mdy[1]!.slice(0, 3)]) {
    return clamp(mdy[3]!, String(months[mdy[1]!.slice(0, 3)]), mdy[2]!);
  }
  // "12/03/2026" or "12-03-26" -> day first
  const sep = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/.exec(s);
  if (sep) {
    let [, a, b, y] = sep as unknown as [string, string, string, string];
    if (y.length === 2) y = `20${y}`;
    let day = a;
    let mon = b;
    if (Number(a) > 12 && Number(b) <= 12) { day = a; mon = b; }
    else if (Number(b) > 12 && Number(a) <= 12) { day = b; mon = a; }
    return clamp(y, mon, day);
  }
  // relative: "within 7 business days", "in 10 days"
  const rel = /\b(?:within|in)\s+(\d{1,3})\s*(?:business\s+)?(day|week|month)s?\b/.exec(s);
  if (rel) {
    const n = Number(rel[1]);
    const mult = rel[2] === 'week' ? 7 : rel[2] === 'month' ? 30 : 1;
    return addDays(today, n * mult);
  }
  return null;

  function clamp(y: string, m: string, d: string): IsoDate | null {
    const yy = Number(y), mm = Number(m), dd = Number(d);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yy < 1970 || yy > 2100) return null;
    const out = `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    return isIsoDate(out) ? out : null;
  }
}
