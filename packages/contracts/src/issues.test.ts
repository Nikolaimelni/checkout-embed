import { describe, expect, it } from 'vitest';
import { int, object, string } from 'zod';
import { describeIssues } from './issues.js';

describe('describeIssues', () => {
  it('puts the path in front of every problem', () => {
    const result = object({ money: object({ amountMinor: int() }), label: string() }).safeParse({
      money: { amountMinor: 'ten' },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const lines = describeIssues(result.error);

      expect(lines).toHaveLength(2);
      expect(lines[0]).toMatch(/^money\.amountMinor: /);
      expect(lines[1]).toMatch(/^label: /);
    }
  });

  it('says root when the value itself is wrong', () => {
    const result = string().safeParse(42);

    expect(result.success).toBe(false);
    if (!result.success) expect(describeIssues(result.error)[0]).toMatch(/^\(root\): /);
  });
});
