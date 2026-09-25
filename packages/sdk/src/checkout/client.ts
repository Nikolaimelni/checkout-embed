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

/** Every call takes a signal, so Back or a teardown cannot leave a confirm in flight. */
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
    idempotencyKey: string,
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

/** HTTP statuses become a code and a retryable flag here, and nowhere else. */
function raise(response: HttpResponse): never {
  const message = messageOf(response);

  if (response.status === 401 || response.status === 403) {
    throw new CheckoutError('invalid_config', message);
  }

  // 429 is backpressure, not an answer about the payment.
  if (response.status === 429 || response.status >= 500) {
    throw new CheckoutError('network', message, { retryable: true });
  }

  throw new CheckoutError('unknown', message);
}

function parse<T>(schema: z.ZodType<T>, response: HttpResponse): T {
  const parsed = schema.safeParse(response.body);

  if (!parsed.success) {
    // The provider answered in a shape this SDK version cannot read.
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

    async confirmIntent(id, methodId, idempotencyKey, signal) {
      const response = ok(
        await http.send({
          method: 'POST',
          path: `/v1/payment-intents/${encodeURIComponent(id)}/confirm`,
          body: { methodId },
          idempotencyKey,
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
