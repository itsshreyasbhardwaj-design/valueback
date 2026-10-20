import { describe, expect, it } from 'vitest';
import {
  exponentOf,
  formatMoney,
  isSupportedCurrency,
  minorToDecimalString,
  parseMoneyToMinor,
  sumMinor,
} from '@/lib/money';

describe('parseMoneyToMinor', () => {
  it('parses whole and decimal amounts into minor units', () => {
    expect(parseMoneyToMinor('2500', 'INR')).toBe(250_000);
    expect(parseMoneyToMinor('2500.00', 'INR')).toBe(250_000);
    expect(parseMoneyToMinor('2500.5', 'INR')).toBe(250_050);
    expect(parseMoneyToMinor('0.01', 'INR')).toBe(1);
  });

  it('strips grouping separators and currency symbols', () => {
    expect(parseMoneyToMinor('1,234.50', 'INR')).toBe(123_450);
    expect(parseMoneyToMinor('₹ 1 234.50', 'INR')).toBe(123_450);
    expect(parseMoneyToMinor('Rs.999', 'INR')).toBe(99_900);
    expect(parseMoneyToMinor('INR 2,500.00', 'INR')).toBe(250_000);
  });

  it('treats a leading dot as a decimal point but a currency full stop as noise', () => {
    expect(parseMoneyToMinor('.50', 'INR')).toBe(50);
    expect(parseMoneyToMinor('Rs.50', 'INR')).toBe(5_000);
    expect(parseMoneyToMinor('-1,234.50', 'INR')).toBe(-123_450);
  });

  it('respects currencies with no minor unit', () => {
    expect(parseMoneyToMinor('1500', 'JPY')).toBe(1500);
    expect(parseMoneyToMinor('1500.99', 'JPY')).toBe(1500);
  });

  it('rejects anything that is not an amount', () => {
    expect(parseMoneyToMinor('', 'INR')).toBeNull();
    expect(parseMoneyToMinor('abc', 'INR')).toBeNull();
    expect(parseMoneyToMinor('1.2.3', 'INR')).toBeNull();
    expect(parseMoneyToMinor('99999999999999999999', 'INR')).toBeNull();
  });

  it('never loses a paisa to binary floating point', () => {
    // 0.1 + 0.2 !== 0.3 in float; in minor units it is exact.
    const a = parseMoneyToMinor('0.10', 'INR')!;
    const b = parseMoneyToMinor('0.20', 'INR')!;
    expect(a + b).toBe(parseMoneyToMinor('0.30', 'INR'));

    // A hundred thousand increments of 0.07 stay exact.
    let total = 0;
    for (let i = 0; i < 100_000; i++) total += parseMoneyToMinor('0.07', 'INR')!;
    expect(total).toBe(700_000);
    expect(minorToDecimalString(total, 'INR')).toBe('7000.00');
  });
});

describe('minorToDecimalString', () => {
  it('round-trips through the parser', () => {
    for (const value of [0, 1, 99, 100, 250_000, 123_456_789]) {
      expect(parseMoneyToMinor(minorToDecimalString(value, 'INR'), 'INR')).toBe(value);
    }
  });

  it('pads small amounts correctly', () => {
    expect(minorToDecimalString(5, 'INR')).toBe('0.05');
    expect(minorToDecimalString(50, 'INR')).toBe('0.50');
    expect(minorToDecimalString(-250, 'INR')).toBe('-2.50');
    expect(minorToDecimalString(1500, 'JPY')).toBe('1500');
  });
});

describe('currency metadata', () => {
  it('knows minor-unit exponents', () => {
    expect(exponentOf('INR')).toBe(2);
    expect(exponentOf('JPY')).toBe(0);
    expect(exponentOf('unknown')).toBe(2);
  });

  it('validates supported codes', () => {
    expect(isSupportedCurrency('inr')).toBe(true);
    expect(isSupportedCurrency('XYZ')).toBe(false);
  });

  it('formats for display without affecting stored values', () => {
    const formatted = formatMoney(250_000, 'INR');
    expect(formatted).toMatch(/2,500\.00/);
    expect(sumMinor([100, 250, 1])).toBe(351);
  });
});
