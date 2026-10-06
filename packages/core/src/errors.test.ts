import { CheckoutFailureSchema } from '@checkout-embed/contracts';
import { describe, expect, it } from 'vitest';
import { CheckoutError, isCheckoutError, toFailure } from './errors.js';

describe('CheckoutError', () => {
  it('flattens to something the host boundary can serialise', () => {
    const error = new CheckoutError('declined', 'The bank said no.');

    expect(CheckoutFailureSchema.parse(error.toFailure())).toEqual({
      code: 'declined',
      message: 'The bank said no.',
    });
  });

  it('is not retryable unless the caller says so', () => {
    expect(new CheckoutError('network', 'Offline.').retryable).toBe(false);
    expect(new CheckoutError('network', 'Offline.', { retryable: true }).retryable).toBe(true);
  });

  it('keeps the original error reachable through cause', () => {
    const cause = new TypeError('fetch failed');

    expect(new CheckoutError('network', 'Offline.', { cause }).cause).toBe(cause);
  });
});

describe('toFailure', () => {
  it('passes a CheckoutError through unchanged', () => {
    expect(toFailure(new CheckoutError('timeout', 'Too slow.'))).toEqual({
      code: 'timeout',
      message: 'Too slow.',
    });
  });

  it('takes the message from a plain Error', () => {
    expect(toFailure(new Error('boom'))).toEqual({ code: 'unknown', message: 'boom' });
  });

  it('falls back to the error name when the message is empty', () => {
    expect(toFailure(new Error())).toEqual({ code: 'unknown', message: 'Error' });
  });

  it.each([
    ['a thrown string', 'nope', 'nope'],
    ['a thrown number', 42, '42'],
    ['null', null, 'null'],
    ['an empty string', '', 'unknown error'],
  ])('produces a parseable failure from %s', (_label, thrown, message) => {
    const failure = toFailure(thrown);

    expect(failure.message).toBe(message);
    expect(CheckoutFailureSchema.safeParse(failure).success).toBe(true);
  });
});

describe('isCheckoutError', () => {
  it('does not mistake an ordinary Error for one of ours', () => {
    expect(isCheckoutError(new Error('boom'))).toBe(false);
    expect(isCheckoutError(new CheckoutError('unknown', 'boom'))).toBe(true);
  });
});
