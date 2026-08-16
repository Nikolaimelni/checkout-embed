import type { CheckoutErrorCode, CheckoutFailure } from '@checkout-embed/contracts';

export type CheckoutErrorOptions = {
  readonly cause?: unknown;
  readonly retryable?: boolean;
};

export class CheckoutError extends Error {
  readonly code: CheckoutErrorCode;
  readonly retryable: boolean;

  constructor(code: CheckoutErrorCode, message: string, options: CheckoutErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'CheckoutError';
    this.code = code;
    this.retryable = options.retryable ?? false;
  }

  toFailure(): CheckoutFailure {
    return { code: this.code, message: this.message };
  }
}

export function isCheckoutError(value: unknown): value is CheckoutError {
  return value instanceof CheckoutError;
}

/**
 * Anything can be thrown in JavaScript and eventually everything is, so the boundary that
 * reports a failure to the host takes unknown rather than Error.
 */
export function toFailure(value: unknown): CheckoutFailure {
  if (isCheckoutError(value)) return value.toFailure();
  if (value instanceof Error) return { code: 'unknown', message: value.message || value.name };
  return { code: 'unknown', message: String(value) || 'unknown error' };
}
