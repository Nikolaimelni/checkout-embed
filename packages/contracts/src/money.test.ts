import { describe, expect, it } from 'vitest';
import { MoneySchema } from './money.js';

describe('MoneySchema', () => {
  it('accepts a zero amount', () => {
    expect(MoneySchema.safeParse({ amountMinor: 0, currency: 'EUR' }).success).toBe(true);
  });

  it.each([
    ['a fractional amount', 10.5, 'EUR'],
    ['a negative amount', -100, 'EUR'],
    ['a lowercase currency', 1000, 'eur'],
    ['a currency of the wrong length', 1000, 'EURO'],
  ])('rejects %s', (_label, amountMinor, currency) => {
    expect(MoneySchema.safeParse({ amountMinor, currency }).success).toBe(false);
  });
});
