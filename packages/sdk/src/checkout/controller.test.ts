import {
  MerchantKeySchema,
  type PaymentIntent,
  PaymentIntentSchema,
  type PaymentMethod,
  PaymentMethodSchema,
  type WidgetEvent,
} from '@checkout-embed/contracts';
import { CheckoutError, createEventBus, type EventBus } from '@checkout-embed/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CheckoutApi } from './client.js';
import { type ControllerOptions, createCheckoutController } from './controller.js';

const merchantKey = MerchantKeySchema.parse('mk_test_acme');
const card = PaymentMethodSchema.parse({ id: 'pm_card', kind: 'card', label: 'Card' });
const wallet = PaymentMethodSchema.parse({
  id: 'pm_wallet',
  kind: 'apple_pay',
  label: 'Apple Pay',
});
const methods: readonly PaymentMethod[] = [card];
const total = { amountMinor: 1000, currency: 'EUR' } as const;
const CHALLENGE = 'https://psp.test/3ds/pi_1';

function intent(overrides: Partial<Record<string, unknown>> = {}): PaymentIntent {
  return PaymentIntentSchema.parse({
    id: 'pi_1',
    status: 'requires_confirmation',
    money: total,
    methodId: card.id,
    createdAt: '2026-09-04T10:00:00Z',
    ...overrides,
  });
}

type Timer = { run: () => void; ms: number };

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function harness(api: Partial<CheckoutApi>, overrides: Partial<ControllerOptions> = {}) {
  const timers: Timer[] = [];
  const seen: WidgetEvent[] = [];
  const events: EventBus = createEventBus();

  for (const type of ['method:selected', 'payment:success', 'payment:error'] as const) {
    events.on(type, (event) => seen.push(event));
  }

  const controller = createCheckoutController({
    api: {
      loadConfig: async () => ({
        bundleUrl: 'https://cdn.test/c.js',
        protocolVersion: 1,
        methods: [...methods],
      }),
      createIntent: async () => intent(),
      confirmIntent: async () => intent({ status: 'succeeded' }),
      readIntent: async () => intent({ status: 'succeeded' }),
      ...api,
    },
    merchantKey,
    total,
    events,
    pollIntervalMs: 10,
    newIdempotencyKey: () => 'key_fixed',
    setTimer: (run, ms) => timers.push({ run, ms }),
    clearTimer: () => {},
    ...overrides,
  });

  /** Fires every timer the controller has queued, in order. */
  const flushTimers = async (rounds = 1): Promise<void> => {
    for (let round = 0; round < rounds; round += 1) {
      const pending = timers.splice(0);
      for (const timer of pending) timer.run();
      await Promise.resolve();
      await Promise.resolve();
    }
  };

  return { controller, events, seen, timers, flushTimers };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('start', () => {
  it('loads the method list and lands on the picker', async () => {
    const { controller } = harness({});

    controller.start();
    await settled();

    expect(controller.getState()).toMatchObject({ status: 'methods', methods });
  });

  it('walks straight to the details screen when the host preselected a method', async () => {
    const { controller } = harness({}, { preselectedMethodId: card.id });

    controller.start();
    await settled();

    expect(controller.getState()).toMatchObject({ status: 'details', method: card });
  });

  it('reports a provider it cannot reach as a failure rather than an empty screen', async () => {
    const { controller, seen } = harness({
      loadConfig: async () => {
        throw new CheckoutError('network', 'offline', { retryable: true });
      },
    });

    controller.start();
    await settled();

    expect(controller.getState()).toMatchObject({
      status: 'failed',
      retryable: true,
      failure: { code: 'network' },
    });
    expect(seen).toContainEqual({
      type: 'payment:error',
      failure: { code: 'network', message: 'offline' },
    });
  });
});

describe('paying', () => {
  let base: ReturnType<typeof harness>;

  beforeEach(async () => {
    base = harness({});
    base.controller.start();
    await settled();
    base.controller.handle({ type: 'select-method', methodId: card.id });
  });

  it('tells the host which method was chosen', () => {
    expect(base.seen).toContainEqual({ type: 'method:selected', methodId: card.id });
  });

  it('creates and confirms with one idempotency key, then reports success', async () => {
    const createIntent = vi.fn(async () => intent());
    const { controller, seen } = harness({
      createIntent,
      confirmIntent: async () => intent({ status: 'succeeded' }),
    });
    controller.start();
    await settled();
    controller.handle({ type: 'select-method', methodId: card.id });

    controller.handle({ type: 'pay' });
    await settled();

    expect(createIntent).toHaveBeenCalledWith(
      { merchantKey, money: total, methodId: card.id },
      'key_fixed',
      expect.objectContaining({ aborted: false }),
    );
    expect(controller.getState().status).toBe('succeeded');
    expect(seen).toContainEqual({ type: 'payment:success', intentId: 'pi_1', money: total });
  });

  it('confirms under a key of its own, so a replayed confirm cannot charge twice', async () => {
    const confirmIntent = vi.fn(async () => intent({ status: 'succeeded' }));
    const { controller } = harness({ confirmIntent });
    controller.start();
    await settled();
    controller.handle({ type: 'select-method', methodId: card.id });

    controller.handle({ type: 'pay' });
    await settled();

    expect(confirmIntent).toHaveBeenCalledWith(
      'pi_1',
      card.id,
      'key_fixed:confirm',
      expect.objectContaining({ aborted: false }),
    );
  });

  it('does not confirm a replayed intent that is already past confirming', async () => {
    const confirmIntent = vi.fn(async () => intent({ status: 'succeeded' }));
    const { controller } = harness({
      createIntent: async () => intent({ status: 'processing' }),
      confirmIntent,
    });
    controller.start();
    await settled();
    controller.handle({ type: 'select-method', methodId: card.id });

    controller.handle({ type: 'pay' });
    await settled();

    expect(confirmIntent).not.toHaveBeenCalled();
    expect(controller.getState().status).toBe('polling');
  });

  it('parks on the challenge when the provider asks for one', async () => {
    const { controller } = harness({
      confirmIntent: async () => intent({ status: 'requires_action', actionUrl: CHALLENGE }),
    });
    controller.start();
    await settled();
    controller.handle({ type: 'select-method', methodId: card.id });

    controller.handle({ type: 'pay' });
    await settled();

    expect(controller.getState()).toMatchObject({
      status: 'requires_action',
      actionUrl: CHALLENGE,
    });
  });

  it('refuses a challenge the provider forgot to give an address', async () => {
    const { controller } = harness({
      confirmIntent: async () => intent({ status: 'requires_action' }),
    });
    controller.start();
    await settled();
    controller.handle({ type: 'select-method', methodId: card.id });

    controller.handle({ type: 'pay' });
    await settled();

    expect(controller.getState()).toMatchObject({
      status: 'failed',
      failure: { code: 'invalid_message' },
    });
  });

  it('polls a processing payment until it settles', async () => {
    const readIntent = vi
      .fn<() => Promise<PaymentIntent>>()
      .mockResolvedValueOnce(intent({ status: 'processing' }))
      .mockResolvedValueOnce(intent({ status: 'succeeded' }));

    const { controller, flushTimers } = harness({
      confirmIntent: async () => intent({ status: 'processing' }),
      readIntent,
    });
    controller.start();
    await settled();
    controller.handle({ type: 'select-method', methodId: card.id });

    controller.handle({ type: 'pay' });
    await settled();
    expect(controller.getState()).toMatchObject({ status: 'polling', attempt: 0 });

    await flushTimers();
    expect(controller.getState()).toMatchObject({ status: 'polling', attempt: 1 });

    await flushTimers();
    expect(controller.getState().status).toBe('succeeded');
  });

  it('turns a declined intent into a retryable failure', async () => {
    const { controller, seen } = harness({
      confirmIntent: async () => intent({ status: 'failed' }),
    });
    controller.start();
    await settled();
    controller.handle({ type: 'select-method', methodId: card.id });

    controller.handle({ type: 'pay' });
    await settled();

    expect(controller.getState()).toMatchObject({ status: 'failed', retryable: true });
    expect(seen.some((event) => event.type === 'payment:error')).toBe(true);
  });

  it('replays the same key when creating the intent failed without an answer', async () => {
    const keys: string[] = [];
    let generated = 0;
    const { controller } = harness(
      {
        createIntent: async (_input, key) => {
          keys.push(key);
          if (keys.length === 1) throw new CheckoutError('network', 'dropped', { retryable: true });
          return intent();
        },
        confirmIntent: async () => intent({ status: 'succeeded' }),
      },
      {
        newIdempotencyKey: () => {
          generated += 1;
          return `key_${generated}`;
        },
      },
    );
    controller.start();
    await settled();
    controller.handle({ type: 'select-method', methodId: card.id });

    controller.handle({ type: 'pay' });
    await settled();
    expect(controller.getState().status).toBe('failed');

    controller.handle({ type: 'retry' });
    controller.handle({ type: 'select-method', methodId: card.id });
    controller.handle({ type: 'pay' });
    await settled();

    expect(keys).toEqual(['key_1', 'key_1']);
    expect(controller.getState().status).toBe('succeeded');
  });

  it('asks the provider what happened before paying again after a lost confirm', async () => {
    const createIntent = vi.fn(async () => intent());
    const readIntent = vi.fn(async () => intent({ status: 'succeeded' }));
    const { controller, seen } = harness({
      createIntent,
      confirmIntent: async () => {
        throw new CheckoutError('timeout', 'too slow', { retryable: true });
      },
      readIntent,
    });
    controller.start();
    await settled();
    controller.handle({ type: 'select-method', methodId: card.id });

    controller.handle({ type: 'pay' });
    await settled();
    expect(controller.getState()).toMatchObject({ status: 'failed', retryable: true });

    controller.handle({ type: 'retry' });
    await settled();

    expect(readIntent).toHaveBeenCalledWith('pi_1', expect.anything());
    expect(createIntent).toHaveBeenCalledOnce();
    expect(controller.getState().status).toBe('succeeded');
    expect(seen.filter((event) => event.type === 'payment:success')).toHaveLength(1);
  });

  it('confirms the same intent again when the provider never saw the confirm', async () => {
    const confirmIntent = vi
      .fn<() => Promise<PaymentIntent>>()
      .mockRejectedValueOnce(new CheckoutError('network', 'dropped', { retryable: true }))
      .mockResolvedValueOnce(intent({ status: 'succeeded' }));
    const { controller } = harness({
      confirmIntent,
      readIntent: async () => intent({ status: 'requires_confirmation' }),
    });
    controller.start();
    await settled();
    controller.handle({ type: 'select-method', methodId: card.id });
    controller.handle({ type: 'pay' });
    await settled();

    controller.handle({ type: 'retry' });
    await settled();
    expect(controller.getState()).toMatchObject({ status: 'details', method: card });

    controller.handle({ type: 'pay' });
    await settled();

    expect(confirmIntent).toHaveBeenCalledTimes(2);
    expect(controller.getState().status).toBe('succeeded');
  });
});

describe('a payment already on the wire', () => {
  it('ignores a second click on Pay until the first one is answered', async () => {
    const created = deferred<PaymentIntent>();
    const confirmIntent = vi.fn(async () => intent({ status: 'succeeded' }));
    const { controller, seen } = harness({ createIntent: () => created.promise, confirmIntent });
    controller.start();
    await settled();
    controller.handle({ type: 'select-method', methodId: card.id });

    controller.handle({ type: 'pay' });
    controller.handle({ type: 'pay' });
    created.resolve(intent());
    await settled();

    expect(confirmIntent).toHaveBeenCalledOnce();
    expect(controller.getState().status).toBe('succeeded');
    expect(seen.map((event) => event.type)).not.toContain('payment:error');
  });

  it('does not confirm once the customer has gone back', async () => {
    const created = deferred<PaymentIntent>();
    const confirmIntent = vi.fn(async () => intent({ status: 'succeeded' }));
    const { controller } = harness({ createIntent: () => created.promise, confirmIntent });
    controller.start();
    await settled();
    controller.handle({ type: 'select-method', methodId: card.id });

    controller.handle({ type: 'pay' });
    controller.handle({ type: 'go-back' });
    created.resolve(intent());
    await settled();

    expect(confirmIntent).not.toHaveBeenCalled();
    expect(controller.getState().status).toBe('methods');
  });

  it('cancels the request it is waiting on when the customer goes back', async () => {
    let signal: { aborted: boolean } | undefined;
    const { controller } = harness({
      createIntent: (_input, _key, received) => {
        signal = received;
        return new Promise<PaymentIntent>(() => {});
      },
    });
    controller.start();
    await settled();
    controller.handle({ type: 'select-method', methodId: card.id });

    controller.handle({ type: 'pay' });
    controller.handle({ type: 'go-back' });

    expect(signal?.aborted).toBe(true);
  });
});

describe('the 3DS challenge', () => {
  it('fails as abandoned when the customer closes it, and reopens it on retry', async () => {
    const challenge = intent({ status: 'requires_action', actionUrl: CHALLENGE });
    const { controller, seen } = harness({
      confirmIntent: async () => challenge,
      readIntent: async () => challenge,
    });
    controller.start();
    await settled();
    controller.handle({ type: 'select-method', methodId: card.id });
    controller.handle({ type: 'pay' });
    await settled();

    controller.handle({ type: 'challenge-dismissed' });

    expect(controller.getState()).toMatchObject({
      status: 'failed',
      retryable: true,
      failure: { code: 'action_abandoned' },
    });
    expect(seen).toContainEqual(
      expect.objectContaining({ type: 'payment:error', failure: expect.anything() }),
    );

    controller.handle({ type: 'retry' });
    await settled();

    expect(controller.getState()).toMatchObject({
      status: 'requires_action',
      actionUrl: CHALLENGE,
    });
  });
});

describe('closing a payment that has not finished', () => {
  const challenge = intent({ status: 'requires_action', actionUrl: CHALLENGE });

  async function abandonChallenge(controller: ReturnType<typeof harness>['controller']) {
    controller.start();
    await settled();
    controller.handle({ type: 'select-method', methodId: card.id });
    controller.handle({ type: 'pay' });
    await settled();
    controller.handle({ type: 'challenge-dismissed' });
    controller.handle({ type: 'dismiss' });
    await settled();
  }

  function counting() {
    let generated = 0;
    return () => {
      generated += 1;
      return `key_${generated}`;
    };
  }

  it('finds the same intent again when the customer pays with the same method', async () => {
    const keys: string[] = [];
    const confirmIntent = vi.fn(async () => challenge);
    const { controller } = harness(
      {
        createIntent: async (_input, key) => {
          keys.push(key);
          return keys.length === 1 ? intent() : challenge;
        },
        confirmIntent,
      },
      { newIdempotencyKey: counting() },
    );

    await abandonChallenge(controller);
    controller.handle({ type: 'select-method', methodId: card.id });
    controller.handle({ type: 'pay' });
    await settled();

    expect(keys).toEqual(['key_1', 'key_1']);
    expect(confirmIntent).toHaveBeenCalledOnce();
    expect(controller.getState()).toMatchObject({ status: 'requires_action' });
  });

  it('follows the earlier intent instead of opening a second one for another method', async () => {
    const createIntent = vi.fn(async () => intent());
    const readIntent = vi.fn(async () => challenge);
    const { controller } = harness({
      loadConfig: async () => ({
        bundleUrl: 'https://cdn.test/c.js',
        protocolVersion: 1,
        methods: [card, wallet],
      }),
      createIntent,
      confirmIntent: async () => challenge,
      readIntent,
    });

    await abandonChallenge(controller);
    controller.handle({ type: 'select-method', methodId: wallet.id });
    controller.handle({ type: 'pay' });
    await settled();

    expect(readIntent).toHaveBeenCalledWith('pi_1', expect.anything());
    expect(createIntent).toHaveBeenCalledOnce();
    expect(controller.getState()).toMatchObject({ status: 'requires_action' });
  });

  it('pays afresh with another method when the earlier intent was never confirmed', async () => {
    const keys: string[] = [];
    const { controller } = harness(
      {
        loadConfig: async () => ({
          bundleUrl: 'https://cdn.test/c.js',
          protocolVersion: 1,
          methods: [card, wallet],
        }),
        createIntent: async (_input, key) => {
          keys.push(key);
          return intent();
        },
        confirmIntent: vi
          .fn<() => Promise<PaymentIntent>>()
          .mockRejectedValueOnce(new CheckoutError('timeout', 'too slow', { retryable: true }))
          .mockResolvedValueOnce(intent({ status: 'succeeded' })),
        readIntent: async () => intent({ status: 'requires_confirmation' }),
      },
      { newIdempotencyKey: counting() },
    );
    controller.start();
    await settled();
    controller.handle({ type: 'select-method', methodId: card.id });
    controller.handle({ type: 'pay' });
    await settled();
    controller.handle({ type: 'dismiss' });
    await settled();

    controller.handle({ type: 'select-method', methodId: wallet.id });
    controller.handle({ type: 'pay' });
    await settled();

    expect(keys).toEqual(['key_1', 'key_2']);
    expect(controller.getState().status).toBe('succeeded');
  });
});

describe('dispose', () => {
  it('neither confirms nor polls for a payment it was torn down in the middle of', async () => {
    const created = deferred<PaymentIntent>();
    const confirmIntent = vi.fn(async () => intent({ status: 'processing' }));
    const { controller, timers } = harness({ createIntent: () => created.promise, confirmIntent });
    controller.start();
    await settled();
    controller.handle({ type: 'select-method', methodId: card.id });

    controller.handle({ type: 'pay' });
    controller.dispose();
    created.resolve(intent());
    await settled();

    expect(confirmIntent).not.toHaveBeenCalled();
    expect(timers).toHaveLength(0);
  });

  it('stops answering once the widget is gone', async () => {
    const { controller, timers } = harness({
      confirmIntent: async () => intent({ status: 'processing' }),
    });
    controller.start();
    await settled();
    controller.handle({ type: 'select-method', methodId: card.id });
    controller.handle({ type: 'pay' });
    await settled();

    const before = controller.getState();
    controller.dispose();
    controller.handle({ type: 'dismiss' });

    expect(controller.getState()).toBe(before);
    expect(timers).toHaveLength(1);
  });
});
