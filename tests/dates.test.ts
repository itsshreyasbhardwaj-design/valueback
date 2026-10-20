import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, formatDate, isIsoDate, monthKey, parseLooseDate } from '@/lib/dates';

describe('calendar arithmetic', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29'); // leap year
  });

  it('measures whole days in both directions', () => {
    expect(daysBetween('2026-10-20', '2026-10-27')).toBe(7);
    expect(daysBetween('2026-10-27', '2026-10-20')).toBe(-7);
    expect(daysBetween('2026-10-20', '2026-10-20')).toBe(0);
  });

  it('validates ISO dates strictly', () => {
    expect(isIsoDate('2026-02-29')).toBe(false); // 2026 is not a leap year
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('20-10-2026')).toBe(false);
  });

  it('formats to the three supported display formats', () => {
    expect(formatDate('2026-12-31', 'dd/MM/yyyy')).toBe('31/12/2026');
    expect(formatDate('2026-12-31', 'MM/dd/yyyy')).toBe('12/31/2026');
    expect(formatDate('2026-12-31', 'yyyy-MM-dd')).toBe('2026-12-31');
    expect(formatDate(null)).toBe('—');
    expect(formatDate('nonsense')).toBe('—');
  });

  it('groups by month', () => {
    expect(monthKey('2026-07-04')).toBe('2026-07');
  });
});

describe('parseLooseDate', () => {
  const today = '2026-10-20';

  it('reads the formats that actually appear on receipts', () => {
    expect(parseLooseDate('2026-12-31', today)).toBe('2026-12-31');
    expect(parseLooseDate('31 Dec 2026', today)).toBe('2026-12-31');
    expect(parseLooseDate('31 December 2026', today)).toBe('2026-12-31');
    expect(parseLooseDate('Dec 31, 2026', today)).toBe('2026-12-31');
    expect(parseLooseDate('31/12/2026', today)).toBe('2026-12-31');
    expect(parseLooseDate('31-12-26', today)).toBe('2026-12-31');
  });

  it('prefers day-first for ambiguous numeric dates', () => {
    // 03/04/2026 is 3 April in the product's default locale, not 4 March.
    expect(parseLooseDate('03/04/2026', today)).toBe('2026-04-03');
  });

  it('disambiguates when one component cannot be a month', () => {
    expect(parseLooseDate('2026-04-25', today)).toBe('2026-04-25');
    expect(parseLooseDate('25/04/2026', today)).toBe('2026-04-25');
  });

  it('resolves relative refund windows against a base date', () => {
    expect(parseLooseDate('within 7 business days', today)).toBe('2026-10-27');
    expect(parseLooseDate('in 2 weeks', today)).toBe('2026-11-03');
  });

  it('returns null rather than guessing', () => {
    expect(parseLooseDate('', today)).toBeNull();
    expect(parseLooseDate('soon', today)).toBeNull();
    expect(parseLooseDate('32/13/2026', today)).toBeNull();
  });
});
