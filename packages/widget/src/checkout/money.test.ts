import { describe, expect, it } from 'vitest';
import { formatMoney } from './money.js';

describe('formatMoney', () => {
  it('reads 1000 minor units of a two digit currency as ten', () => {
    expect(formatMoney({ amountMinor: 1000, currency: 'EUR' }, 'en-US')).toContain('10.00');
  });

  it('does not divide a currency that has no minor unit', () => {
    expect(formatMoney({ amountMinor: 1000, currency: 'JPY' }, 'en-US')).toContain('1,000');
  });

  it('divides a three digit currency by a thousand', () => {
    expect(formatMoney({ amountMinor: 1000, currency: 'BHD' }, 'en-US')).toContain('1.000');
  });

  it('keeps the trailing zeros a price needs', () => {
    expect(formatMoney({ amountMinor: 1050, currency: 'USD' }, 'en-US')).toContain('10.50');
  });

  it('follows the locale for grouping and placement', () => {
    const german = formatMoney({ amountMinor: 123_456, currency: 'EUR' }, 'de-DE');

    expect(german).toContain('1.234,56');
  });
});
