import {
  type PaymentIntentStatus,
  type PaymentMethod,
  PaymentMethodSchema,
} from '@checkout-embed/contracts';

export const FAKE_METHODS: readonly PaymentMethod[] = [
  PaymentMethodSchema.parse({ id: 'pm_card', kind: 'card', label: 'Card' }),
  PaymentMethodSchema.parse({
    id: 'pm_saved',
    kind: 'saved_card',
    label: 'Visa ending 4242',
    brand: 'visa',
    last4: '4242',
  }),
];

export const FAKE_BUNDLE = 'https://cdn.test/checkout.js';
export const FAKE_CHALLENGE = 'https://psp.test/3ds/pi_fake';

export type FakePspOptions = {
  /** What confirm answers with. Everything else follows from that. */
  readonly confirmStatus?: PaymentIntentStatus;
  readonly configStatus?: number;
};

export type FakePsp = {
  readonly fetch: typeof fetch;
  readonly calls: string[];
};

function json(status: number, body: unknown): Response {
  return { status, ok: status < 400, text: async () => JSON.stringify(body) } as Response;
}

/**
 * Enough of the mock provider to drive the SDK without a server. The real one is covered
 * by its own tests; what matters here is the shape of the answers.
 */
export function createFakePsp(options: FakePspOptions = {}): FakePsp {
  const confirmStatus = options.confirmStatus ?? 'succeeded';
  const calls: string[] = [];

  const intent = (status: PaymentIntentStatus) => ({
    id: 'pi_fake',
    status,
    money: { amountMinor: 1000, currency: 'EUR' },
    methodId: 'pm_card',
    createdAt: '2026-09-04T10:00:00Z',
    actionUrl: status === 'requires_action' ? FAKE_CHALLENGE : null,
  });

  const impl = async (input: string | URL | Request): Promise<Response> => {
    const url = typeof input === 'string' ? input : String(input);
    calls.push(url);

    if (url.includes('/v1/config/')) {
      return options.configStatus !== undefined
        ? json(options.configStatus, { error: { message: 'no' } })
        : json(200, {
            bundleUrl: FAKE_BUNDLE,
            protocolVersion: 1,
            methods: [...FAKE_METHODS],
          });
    }

    if (url.endsWith('/confirm')) return json(200, intent(confirmStatus));
    if (url.includes('/v1/payment-intents/')) return json(200, intent('succeeded'));
    if (url.endsWith('/v1/payment-intents')) return json(201, intent('requires_confirmation'));

    return json(404, { error: { message: `nothing at ${url}` } });
  };

  return { fetch: impl as typeof fetch, calls };
}
