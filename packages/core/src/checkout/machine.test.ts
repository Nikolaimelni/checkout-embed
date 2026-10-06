import {
  type PaymentIntent,
  PaymentIntentSchema,
  type PaymentMethod,
  PaymentMethodIdSchema,
  PaymentMethodSchema,
} from '@checkout-embed/contracts';
import { describe, expect, it } from 'vitest';
import type { Logger, LogLevel } from '../adapters/logger.js';
import { createCheckoutReducer, DEFAULT_MAX_POLL_ATTEMPTS } from './machine.js';
import {
  type CheckoutAction,
  type CheckoutActionType,
  type CheckoutState,
  type CheckoutStatus,
  INITIAL_STATE,
} from './state.js';

type LogEntry = {
  readonly level: LogLevel;
  readonly message: string;
  readonly detail: Readonly<Record<string, unknown>> | undefined;
};

function spyLogger(): { logger: Logger; entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  return {
    entries,
    logger: {
      log(level, message, detail) {
        entries.push({ level, message, detail });
      },
    },
  };
}

const card = PaymentMethodSchema.parse({ id: 'pm_card', kind: 'card', label: 'Card' });
const wallet = PaymentMethodSchema.parse({
  id: 'pm_wallet',
  kind: 'apple_pay',
  label: 'Apple Pay',
});
const methods: readonly PaymentMethod[] = [card, wallet];

const intent: PaymentIntent = PaymentIntentSchema.parse({
  id: 'pi_1',
  status: 'requires_confirmation',
  money: { amountMinor: 1000, currency: 'EUR' },
  methodId: card.id,
  createdAt: '2026-09-04T10:00:00Z',
});

const challengeUrl = 'https://psp.example.com/3ds/pi_1';
const declined = { code: 'declined', message: 'The bank said no.' } as const;

const STATES: Readonly<Record<CheckoutStatus, CheckoutState>> = {
  idle: { status: 'idle' },
  methods: { status: 'methods', methods },
  details: { status: 'details', methods, method: card },
  confirming: { status: 'confirming', methods, method: card, intent },
  requires_action: {
    status: 'requires_action',
    methods,
    method: card,
    intent,
    actionUrl: challengeUrl,
  },
  polling: { status: 'polling', methods, method: card, intent, attempt: 0 },
  succeeded: { status: 'succeeded', intent },
  failed: { status: 'failed', methods, failure: declined, retryable: true },
};

const ACTIONS: {
  readonly [TType in CheckoutActionType]: Extract<CheckoutAction, { type: TType }>;
} = {
  'methods/loaded': { type: 'methods/loaded', methods },
  'method/selected': { type: 'method/selected', methodId: card.id },
  'details/dismissed': { type: 'details/dismissed' },
  'intent/created': { type: 'intent/created', intent },
  'action/required': { type: 'action/required', actionUrl: challengeUrl },
  'poll/started': { type: 'poll/started' },
  'poll/tick': { type: 'poll/tick', intent },
  'payment/succeeded': { type: 'payment/succeeded', intent },
  'payment/failed': { type: 'payment/failed', failure: declined, retryable: true },
  'checkout/retried': { type: 'checkout/retried' },
  'checkout/reset': { type: 'checkout/reset' },
};

const EXPECTED: Readonly<
  Record<CheckoutStatus, Partial<Record<CheckoutActionType, CheckoutStatus>>>
> = {
  idle: { 'methods/loaded': 'methods', 'payment/failed': 'failed' },
  methods: {
    'methods/loaded': 'methods',
    'method/selected': 'details',
    'payment/failed': 'failed',
  },
  details: {
    'intent/created': 'confirming',
    'details/dismissed': 'methods',
    'payment/failed': 'failed',
  },
  confirming: {
    'poll/started': 'polling',
    'action/required': 'requires_action',
    'payment/succeeded': 'succeeded',
    'payment/failed': 'failed',
  },
  requires_action: { 'poll/started': 'polling', 'payment/failed': 'failed' },
  polling: {
    'poll/tick': 'polling',
    'payment/succeeded': 'succeeded',
    'payment/failed': 'failed',
  },
  succeeded: { 'checkout/reset': 'idle' },
  failed: { 'checkout/retried': 'methods', 'checkout/reset': 'idle' },
};

const pairs = (Object.keys(STATES) as CheckoutStatus[]).flatMap((status) =>
  (Object.keys(ACTIONS) as CheckoutActionType[]).map(
    (type) => [status, type, EXPECTED[status][type]] as const,
  ),
);

describe('the whole transition matrix', () => {
  it.each(pairs)('%s on %s settles in %s', (status, type, expected) => {
    const { logger, entries } = spyLogger();
    const reduce = createCheckoutReducer({ logger });
    const state = STATES[status];

    const next = reduce(state, ACTIONS[type]);

    if (expected === undefined) {
      expect(next).toBe(state);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.level).toBe('warn');
    } else {
      expect(next.status).toBe(expected);
      expect(next).not.toBe(state);
      expect(entries).toHaveLength(0);
    }
  });
});

describe('a payment that needs no challenge', () => {
  it('walks from an empty screen to a receipt', () => {
    const reduce = createCheckoutReducer();

    const listed = reduce(INITIAL_STATE, { type: 'methods/loaded', methods });
    const chosen = reduce(listed, { type: 'method/selected', methodId: card.id });
    const confirming = reduce(chosen, { type: 'intent/created', intent });
    const done = reduce(confirming, { type: 'payment/succeeded', intent });

    expect([listed.status, chosen.status, confirming.status, done.status]).toEqual([
      'methods',
      'details',
      'confirming',
      'succeeded',
    ]);
  });
});

describe('a payment that needs 3DS', () => {
  it('parks on the challenge and polls once it comes back', () => {
    const reduce = createCheckoutReducer();

    const challenged = reduce(STATES.confirming, {
      type: 'action/required',
      actionUrl: challengeUrl,
    });
    expect(challenged).toMatchObject({ status: 'requires_action', actionUrl: challengeUrl });

    const polling = reduce(challenged, { type: 'poll/started' });
    expect(polling).toMatchObject({ status: 'polling', attempt: 0 });

    const settled = reduce(polling, { type: 'payment/succeeded', intent });
    expect(settled).toMatchObject({ status: 'succeeded' });
  });
});

describe('guards the table alone cannot express', () => {
  it('drops a selection of a method that is not on the list', () => {
    const { logger, entries } = spyLogger();
    const reduce = createCheckoutReducer({ logger });

    const next = reduce(STATES.methods, {
      type: 'method/selected',
      methodId: PaymentMethodIdSchema.parse('pm_ghost'),
    });

    expect(next).toBe(STATES.methods);
    expect(entries[0]?.detail).toMatchObject({ why: 'no method with id pm_ghost' });
  });

  it('keeps a selection of a method that is on the list', () => {
    const reduce = createCheckoutReducer();

    const next = reduce(STATES.methods, { type: 'method/selected', methodId: wallet.id });

    expect(next).toMatchObject({ status: 'details', method: wallet });
  });

  it('refuses to retry a failure the provider called final', () => {
    const { logger, entries } = spyLogger();
    const reduce = createCheckoutReducer({ logger });
    const final: CheckoutState = { status: 'failed', methods, failure: declined, retryable: false };

    const next = reduce(final, { type: 'checkout/retried' });

    expect(next).toBe(final);
    expect(entries[0]?.detail).toMatchObject({ why: 'the failure is not retryable' });
  });
});

describe('polling', () => {
  it('counts attempts and adopts the intent each tick returns', () => {
    const reduce = createCheckoutReducer();
    const processing: PaymentIntent = { ...intent, status: 'processing' };

    const next = reduce(STATES.polling, { type: 'poll/tick', intent: processing });

    expect(next).toMatchObject({ status: 'polling', attempt: 1, intent: processing });
  });

  it('gives up as a retryable timeout once the budget is spent', () => {
    const reduce = createCheckoutReducer({ maxPollAttempts: 2 });
    const start: CheckoutState = { status: 'polling', methods, method: card, intent, attempt: 2 };

    const next = reduce(start, { type: 'poll/tick', intent });

    expect(next).toMatchObject({
      status: 'failed',
      retryable: true,
      failure: { code: 'timeout' },
    });
  });

  it('leaves a minute for a payment to settle at the SDK poll interval', () => {
    expect(DEFAULT_MAX_POLL_ATTEMPTS * 1.5).toBeGreaterThanOrEqual(60);
  });
});

describe('the default reducer', () => {
  it('says nothing when it drops an action and no logger was given', () => {
    const reduce = createCheckoutReducer();

    expect(() => reduce(INITIAL_STATE, { type: 'checkout/reset' })).not.toThrow();
  });
});
