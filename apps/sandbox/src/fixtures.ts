import {
  type Money,
  type PaymentIntent,
  PaymentIntentSchema,
  type PaymentMethod,
  PaymentMethodSchema,
} from '@checkout-embed/contracts';
import type { CheckoutState } from '@checkout-embed/core';

export const TOTAL: Money = { amountMinor: 1000, currency: 'EUR' };

// Next to the bench rather than on the mock provider, so the 3DS step also works where the
// bench is hosted as static files.
export const CHALLENGE_URL = new URL('challenge.html', document.baseURI).href;

export const METHODS: readonly PaymentMethod[] = [
  PaymentMethodSchema.parse({ id: 'pm_card', kind: 'card', label: 'Card' }),
  PaymentMethodSchema.parse({ id: 'pm_apple_pay', kind: 'apple_pay', label: 'Apple Pay' }),
  PaymentMethodSchema.parse({
    id: 'pm_saved_visa',
    kind: 'saved_card',
    label: 'Visa ending 4242',
    brand: 'visa',
    last4: '4242',
  }),
];

const method = METHODS[0] as PaymentMethod;

const intent: PaymentIntent = PaymentIntentSchema.parse({
  id: 'pi_sandbox',
  status: 'requires_confirmation',
  money: TOTAL,
  methodId: method.id,
  createdAt: '2026-09-04T10:00:00Z',
});

/** One entry per state of the machine. The stories below are generated from this. */
export const STATES = {
  idle: { status: 'idle' },
  methods: { status: 'methods', methods: METHODS },
  details: { status: 'details', methods: METHODS, method },
  confirming: { status: 'confirming', methods: METHODS, method, intent },
  requiresAction: {
    status: 'requires_action',
    methods: METHODS,
    method,
    intent,
    actionUrl: CHALLENGE_URL,
  },
  polling: { status: 'polling', methods: METHODS, method, intent, attempt: 3 },
  succeeded: { status: 'succeeded', intent },
  failed: {
    status: 'failed',
    methods: METHODS,
    failure: { code: 'declined', message: 'The bank said no.' },
    retryable: true,
  },
  failedFinal: {
    status: 'failed',
    methods: METHODS,
    failure: { code: 'invalid_config', message: 'This merchant key is not active.' },
    retryable: false,
  },
} as const satisfies Record<string, CheckoutState>;
