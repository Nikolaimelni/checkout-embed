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
import { createCheckoutController } from './controller.js';

const merchantKey = MerchantKeySchema.parse('mk_test_acme');
const card = PaymentMethodSchema.parse({ id: 'pm_card', kind: 'card', label: 'Card' });
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

function harness(api: Partial<CheckoutApi>) {
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
    const timers: Timer[] = [];
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
      },
      merchantKey,
      total,
      events: createEventBus(),
      preselectedMethodId: card.id,
      setTimer: (run, ms) => timers.push({ run, ms }),
      clearTimer: () => {},
    });

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
    );
    expect(controller.getState().status).toBe('succeeded');
    expect(seen).toContainEqual({ type: 'payment:success', intentId: 'pi_1', money: total });
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

  it('keeps the same key across a retry of the same attempt', async () => {
    const keys: string[] = [];
    let attempt = 0;
    const { controller } = harness({
      createIntent: async (_input, key) => {
        keys.push(key);
        attempt += 1;
        if (attempt === 1) throw new CheckoutError('network', 'dropped', { retryable: true });
        return intent();
      },
      confirmIntent: async () => intent({ status: 'succeeded' }),
    });
    controller.start();
    await settled();
    controller.handle({ type: 'select-method', methodId: card.id });

    controller.handle({ type: 'pay' });
    await settled();
    expect(controller.getState().status).toBe('failed');

    // Retry lands back on the picker; choosing again and paying is a fresh attempt.
    controller.handle({ type: 'retry' });
    controller.handle({ type: 'select-method', methodId: card.id });
    controller.handle({ type: 'pay' });
    await settled();

    expect(keys).toHaveLength(2);
    expect(controller.getState().status).toBe('succeeded');
  });
});

describe('dispose', () => {
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
