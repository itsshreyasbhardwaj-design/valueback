/**
 * Money = integer minor units + ISO-4217 code. No float ever touches a balance.
 */
const EXPONENTS: Record<string, number> = {
  INR: 2, USD: 2, EUR: 2, GBP: 2, AUD: 2, CAD: 2, SGD: 2, AED: 2,
  JPY: 0, KRW: 0,
};

export const SUPPORTED_CURRENCIES = Object.keys(EXPONENTS);

export function exponentOf(currency: string): number {
  return EXPONENTS[currency.toUpperCase()] ?? 2;
}

export function isSupportedCurrency(c: string): boolean {
  return c.toUpperCase() in EXPONENTS;
}

/**
 * Parse human input ("1,234.5", "₹1234.50", "1234") into minor units.
 * Returns null when the input is not a well-formed amount. Pure integer maths:
 * the fractional part is padded/truncated as text, never multiplied as a float.
 */
export function parseMoneyToMinor(input: string, currency: string): number | null {
  const exp = exponentOf(currency);
  const cleaned = input.trim().replace(/[\s, ]/g, '').replace(/^[^\d\-.]+/, '');
  if (cleaned === '') return null;
  const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(cleaned);
  if (!m) return null;
  const [, sign, whole = '', frac = ''] = m;
  if (whole === '' && frac === '') return null;
  const fracPadded = (frac ?? '').padEnd(exp, '0').slice(0, exp);
  const digits = `${whole || '0'}${fracPadded}`;
  const value = Number.parseInt(digits, 10);
  if (!Number.isSafeInteger(value)) return null;
  return sign === '-' ? -value : value;
}

/** Minor units -> plain decimal string, e.g. 123450 INR -> "1234.50" */
export function minorToDecimalString(minor: number, currency: string): string {
  const exp = exponentOf(currency);
  const neg = minor < 0;
  const s = Math.abs(minor).toString().padStart(exp + 1, '0');
  const whole = s.slice(0, s.length - exp) || '0';
  const frac = exp > 0 ? `.${s.slice(s.length - exp)}` : '';
  return `${neg ? '-' : ''}${whole}${frac}`;
}

/** Localised display, e.g. "₹1,234.50". Falls back to CODE 1234.50 if Intl lacks it. */
export function formatMoney(minor: number, currency: string, locale = 'en-IN'): string {
  const exp = exponentOf(currency);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: exp,
      maximumFractionDigits: exp,
    }).format(minor / 10 ** exp); // display only — never fed back into a balance
  } catch {
    return `${currency.toUpperCase()} ${minorToDecimalString(minor, currency)}`;
  }
}

/** Sum of same-currency amounts. Throws on a mixed-currency sum — see analytics.ts. */
export function sumMinor(amounts: number[]): number {
  return amounts.reduce((a, b) => a + b, 0);
}
