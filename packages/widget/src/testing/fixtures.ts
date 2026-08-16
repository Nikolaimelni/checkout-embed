import {
  type PaymentIntent,
  PaymentIntentSchema,
  type PaymentMethod,
  PaymentMethodSchema,
} from '@checkout-embed/contracts';
import type { CheckoutState } from '@checkout-embed/core';

// Through parse rather than a cast, so the branded ids are real ones.
export const card = PaymentMethodSchema.parse({ id: 'pm_card', kind: 'card', label: 'Card' });

export const savedCard = PaymentMethodSchema.parse({
  id: 'pm_saved',
  kind: 'saved_card',
  label: 'Visa ending 4242',
  brand: 'visa',
  last4: '4242',
});

export const methods: readonly PaymentMethod[] = [card, savedCard];

export const intent: PaymentIntent = PaymentIntentSchema.parse({
  id: 'pi_1',
  status: 'requires_confirmation',
  money: { amountMinor: 1000, currency: 'EUR' },
  methodId: card.id,
  createdAt: '2026-09-04T10:00:00Z',
});

export const CHALLENGE_URL = 'https://psp.test/3ds/pi_1';

export const states: Readonly<Record<string, CheckoutState>> = {
  idle: { status: 'idle' },
  methods: { status: 'methods', methods },
  details: { status: 'details', methods, method: card },
  confirming: { status: 'confirming', methods, method: card, intent },
  requires_action: {
    status: 'requires_action',
    methods,
    method: card,
    intent,
    actionUrl: CHALLENGE_URL,
  },
  polling: { status: 'polling', methods, method: card, intent, attempt: 1 },
  succeeded: { status: 'succeeded', intent },
  failed: {
    status: 'failed',
    methods,
    failure: { code: 'declined', message: 'The bank said no.' },
    retryable: true,
  },
  failedFinal: {
    status: 'failed',
    methods,
    failure: { code: 'declined', message: 'The bank said no.' },
    retryable: false,
  },
};
