import { describe, expect, it } from 'vitest';
import { outcomeFor, TRIGGERS } from './triggers.ts';

describe('outcomeFor', () => {
  it.each(TRIGGERS)('maps $amountMinor to $outcome', ({ amountMinor, outcome }) => {
    expect(outcomeFor(amountMinor)).toBe(outcome);
  });

  it('lets every other amount through, so the demo is not a minefield', () => {
    expect(outcomeFor(4200)).toBe('succeed');
    expect(outcomeFor(0)).toBe('succeed');
  });

  it('has no duplicate trigger amounts', () => {
    const amounts = TRIGGERS.map((trigger) => trigger.amountMinor);

    expect(new Set(amounts).size).toBe(amounts.length);
  });
});
