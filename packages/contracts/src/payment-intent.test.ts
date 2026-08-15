import { describe, expect, it } from 'vitest';
import { isTerminalIntentStatus, PaymentIntentSchema } from './payment-intent.js';

const base = {
  id: 'pi_1',
  status: 'requires_confirmation',
  money: { amountMinor: 1000, currency: 'EUR' },
  methodId: null,
  createdAt: '2026-09-04T10:00:00Z',
} as const;

describe('PaymentIntentSchema', () => {
  it('defaults actionUrl to null so the absence of a challenge is explicit', () => {
    expect(PaymentIntentSchema.parse(base).actionUrl).toBeNull();
  });

  it('rejects a createdAt that is not an ISO timestamp', () => {
    expect(PaymentIntentSchema.safeParse({ ...base, createdAt: '2026-09-04' }).success).toBe(false);
  });
});

describe('isTerminalIntentStatus', () => {
  it('treats canceled as terminal, which is the one people forget', () => {
    expect(isTerminalIntentStatus('canceled')).toBe(true);
    expect(isTerminalIntentStatus('processing')).toBe(false);
  });
});
