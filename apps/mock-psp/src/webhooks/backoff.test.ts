import { describe, expect, it } from 'vitest';
import { backoffFor, MAX_ATTEMPTS, MAX_DELAY_MS } from './backoff.ts';

describe('backoffFor', () => {
  it('starts at a second and doubles', () => {
    expect([backoffFor(1), backoffFor(2), backoffFor(3), backoffFor(4)]).toEqual([
      1_000, 2_000, 4_000, 8_000,
    ]);
  });

  it('stops growing at the ceiling', () => {
    expect(backoffFor(MAX_ATTEMPTS - 1)).toBe(MAX_DELAY_MS);
  });

  it('gives up rather than retrying forever', () => {
    expect(backoffFor(MAX_ATTEMPTS)).toBeNull();
  });
});
