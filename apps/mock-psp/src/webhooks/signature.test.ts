import { describe, expect, it } from 'vitest';
import { parseSignature, signPayload, verifySignature } from './signature.ts';

const secret = 'a-secret-long-enough-for-the-schema';
const payload = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded' });
const now = 1_760_000_000;

describe('signPayload', () => {
  it('produces a header with the timestamp and the digest', () => {
    expect(signPayload(payload, secret, now)).toMatch(/^t=1760000000,v1=[0-9a-f]{64}$/);
  });

  it('signs the timestamp together with the body, not the body alone', () => {
    expect(signPayload(payload, secret, now)).not.toBe(signPayload(payload, secret, now + 1));
  });
});

describe('verifySignature', () => {
  it('accepts a signature it just made', () => {
    const header = signPayload(payload, secret, now);

    expect(verifySignature(header, payload, secret, { nowSeconds: now })).toBe(true);
  });

  it('rejects a body that changed after signing', () => {
    const header = signPayload(payload, secret, now);

    expect(verifySignature(header, `${payload} `, secret, { nowSeconds: now })).toBe(false);
  });

  it('rejects the wrong secret', () => {
    const header = signPayload(payload, secret, now);

    expect(verifySignature(header, payload, 'someone-elses-secret', { nowSeconds: now })).toBe(
      false,
    );
  });

  it('rejects a delivery replayed a day later', () => {
    const header = signPayload(payload, secret, now);

    expect(verifySignature(header, payload, secret, { nowSeconds: now + 86_400 })).toBe(false);
  });

  it('accepts one that arrives inside the tolerance window', () => {
    const header = signPayload(payload, secret, now);

    expect(verifySignature(header, payload, secret, { nowSeconds: now + 120 })).toBe(true);
  });

  it.each(['', 'garbage', 't=abc,v1=deadbeef', 'v1=deadbeef', 't=1760000000'])(
    'rejects the malformed header %j',
    (header) => {
      expect(verifySignature(header, payload, secret, { nowSeconds: now })).toBe(false);
    },
  );
});

describe('parseSignature', () => {
  it('reads a header back into its parts', () => {
    expect(parseSignature('t=1760000000,v1=abc')).toEqual({ timestamp: 1_760_000_000, v1: 'abc' });
  });
});
