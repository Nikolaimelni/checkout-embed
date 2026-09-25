import {
  MerchantKeySchema,
  type Money,
  type PaymentIntent,
  PaymentIntentSchema,
  type PaymentIntentStatus,
  type PaymentMethod,
  type PaymentMethodId,
} from '@checkout-embed/contracts';
import { createEventBus } from '@checkout-embed/core';
import {
  type CheckoutApi,
  type CheckoutController,
  createCheckoutController,
} from '@checkout-embed/sdk';

export const OUTCOMES = ['succeed', 'decline', 'require_action'] as const;

export type Outcome = (typeof OUTCOMES)[number];

export type DriverOptions = {
  readonly methods: readonly PaymentMethod[];
  readonly total: Money;
  readonly outcome: Outcome;
  readonly challengeUrl: string;
  /** How long the fake provider takes to answer, and the poll interval. */
  readonly latencyMs?: number;
};

export type Driver = CheckoutController;

const SANDBOX_KEY = MerchantKeySchema.parse('mk_sandbox');

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * A provider that lives in memory and answers like the mock one: confirm picks the outcome,
 * a finished challenge goes through processing, and a read reports where the intent is.
 */
function createSandboxProvider(options: DriverOptions) {
  const latencyMs = options.latencyMs ?? 500;
  let status: PaymentIntentStatus = 'requires_confirmation';
  let methodId: PaymentMethodId | null = null;

  const current = (): PaymentIntent =>
    PaymentIntentSchema.parse({
      id: 'pi_sandbox',
      status,
      money: options.total,
      methodId,
      createdAt: new Date().toISOString(),
      actionUrl: status === 'requires_action' ? options.challengeUrl : null,
    });

  const api: CheckoutApi = {
    async loadConfig() {
      await pause(latencyMs);
      return {
        bundleUrl: 'https://sandbox.invalid/bundle.js',
        protocolVersion: 1,
        methods: [...options.methods],
      };
    },

    async createIntent(input) {
      await pause(latencyMs);
      status = 'requires_confirmation';
      methodId = input.methodId;
      return current();
    },

    async confirmIntent() {
      await pause(latencyMs);
      status =
        options.outcome === 'decline'
          ? 'failed'
          : options.outcome === 'require_action'
            ? 'requires_action'
            : 'processing';
      return current();
    },

    async readIntent() {
      await pause(latencyMs);
      if (status === 'processing') status = 'succeeded';
      return current();
    },
  };

  return {
    api,
    finishChallenge() {
      if (status === 'requires_action') status = 'processing';
    },
  };
}

/**
 * The SDK's own controller against a provider in memory, so the bench shows what a merchant
 * gets, retries and Close included, without a network.
 */
export function createDriver(options: DriverOptions): Driver {
  const provider = createSandboxProvider(options);
  const controller = createCheckoutController({
    api: provider.api,
    merchantKey: SANDBOX_KEY,
    total: options.total,
    events: createEventBus(),
    pollIntervalMs: options.latencyMs ?? 500,
  });

  return {
    ...controller,
    handle(intent) {
      // The provider's page would have recorded the answer itself. Here the click is all
      // there is.
      if (intent.type === 'challenge-finished') provider.finishChallenge();
      controller.handle(intent);
    },
  };
}
