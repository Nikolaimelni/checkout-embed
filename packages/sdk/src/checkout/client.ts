import {
  type MerchantKey,
  type Money,
  type PaymentIntent,
  type PaymentIntentId,
  PaymentIntentSchema,
  type PaymentMethodId,
  type RemoteWidgetConfig,
  RemoteWidgetConfigSchema,
} from '@checkout-embed/contracts';
import {
  type AbortLike,
  CheckoutError,
  type HttpAdapter,
  type HttpResponse,
} from '@checkout-embed/core';
import type { z } from 'zod';

/**
 * Every call takes the signal that ends it. A customer pressing Back, or a widget torn down
 * mid-payment, must not leave a request behind that goes on to confirm a charge.
 */
export type CheckoutApi = {
  loadConfig(merchantKey: MerchantKey, signal?: AbortLike): Promise<RemoteWidgetConfig>;
  createIntent(
    input: CreateIntentInput,
    idempotencyKey: string,
    signal?: AbortLike,
  ): Promise<PaymentIntent>;
  confirmIntent(
    id: PaymentIntentId,
    methodId: PaymentMethodId,
    signal?: AbortLike,
  ): Promise<PaymentIntent>;
  readIntent(id: PaymentIntentId, signal?: AbortLike): Promise<PaymentIntent>;
};

export type CreateIntentInput = {
  readonly merchantKey: MerchantKey;
  readonly money: Money;
  readonly methodId: PaymentMethodId | null;
};

type ErrorBody = { error?: { message?: unknown } } | null;

function messageOf(response: HttpResponse): string {
  const message = (response.body as ErrorBody)?.error?.message;
  return typeof message === 'string' && message.length > 0
    ? message
    : `The payment provider answered ${response.status}.`;
}

/**
 * Status codes translated once, here, so that everything above this line reasons about a
 * code and a retryable flag rather than about HTTP.
 */
function raise(response: HttpResponse): never {
  const message = messageOf(response);

  if (response.status === 401 || response.status === 403) {
    throw new CheckoutError('invalid_config', message);
  }

  // Too many requests is the provider asking us to slow down, not an answer about the payment.
  if (response.status === 429 || response.status >= 500) {
    throw new CheckoutError('network', message, { retryable: true });
  }

  throw new CheckoutError('unknown', message);
}

function parse<T>(schema: z.ZodType<T>, response: HttpResponse): T {
  const parsed = schema.safeParse(response.body);

  if (!parsed.success) {
    // Not a decline and not an outage: the provider answered something this version of the
    // SDK cannot read. Saying so beats rendering a screen built from undefined.
    throw new CheckoutError(
      'invalid_message',
      'The payment provider answered in a shape this version does not understand.',
      { cause: parsed.error },
    );
  }

  return parsed.data;
}

const withSignal = (signal: AbortLike | undefined) => (signal ? { signal } : {});

export function createCheckoutApi(http: HttpAdapter): CheckoutApi {
  const ok = (response: HttpResponse): HttpResponse =>
    response.status >= 200 && response.status < 300 ? response : raise(response);

  return {
    async loadConfig(merchantKey, signal) {
      const response = ok(
        await http.send({
          method: 'GET',
          path: `/v1/config/${encodeURIComponent(merchantKey)}`,
          ...withSignal(signal),
        }),
      );
      return parse(RemoteWidgetConfigSchema, response);
    },

    async createIntent(input, idempotencyKey, signal) {
      const response = ok(
        await http.send({
          method: 'POST',
          path: '/v1/payment-intents',
          body: input,
          idempotencyKey,
          ...withSignal(signal),
        }),
      );
      return parse(PaymentIntentSchema, response);
    },

    async confirmIntent(id, methodId, signal) {
      const response = ok(
        await http.send({
          method: 'POST',
          path: `/v1/payment-intents/${encodeURIComponent(id)}/confirm`,
          body: { methodId },
          ...withSignal(signal),
        }),
      );
      return parse(PaymentIntentSchema, response);
    },

    async readIntent(id, signal) {
      const response = ok(
        await http.send({
          method: 'GET',
          path: `/v1/payment-intents/${encodeURIComponent(id)}`,
          ...withSignal(signal),
        }),
      );
      return parse(PaymentIntentSchema, response);
    },
  };
}
