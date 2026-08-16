import {
  type PaymentIntent,
  PaymentIntentSchema,
  type PaymentMethod,
} from '@checkout-embed/contracts';
import {
  type CheckoutAction,
  type CheckoutState,
  createCheckoutReducer,
  INITIAL_STATE,
} from '@checkout-embed/core';
import type { WidgetIntent, WidgetStore } from '@checkout-embed/widget';

export const OUTCOMES = ['succeed', 'decline', 'require_action'] as const;

export type Outcome = (typeof OUTCOMES)[number];

export type DriverOptions = {
  readonly methods: readonly PaymentMethod[];
  readonly outcome: Outcome;
  readonly challengeUrl: string;
  /** How long the fake provider takes to answer. Zero makes the tests instant. */
  readonly latencyMs?: number;
  readonly schedule?: (run: () => void, delayMs: number) => void;
};

export type Driver = WidgetStore & {
  handle(intent: WidgetIntent): void;
  /** Loads the method list, the way the SDK would after resolving its config. */
  open(): void;
};

const intentFor = (methodId: string): PaymentIntent =>
  PaymentIntentSchema.parse({
    id: 'pi_sandbox',
    status: 'requires_confirmation',
    money: { amountMinor: 1000, currency: 'EUR' },
    methodId,
    createdAt: new Date().toISOString(),
  });

/**
 * The sandbox stands in for the SDK: same reducer, same widget, no network. It exists so
 * that every screen can be reached by clicking, and so a change to the machine shows up
 * as a broken bench rather than as a surprise in week five.
 */
export function createDriver(options: DriverOptions): Driver {
  const latencyMs = options.latencyMs ?? 500;
  const schedule = options.schedule ?? ((run, delay) => setTimeout(run, delay));
  const reduce = createCheckoutReducer();
  const listeners = new Set<() => void>();

  let state: CheckoutState = INITIAL_STATE;

  const dispatch = (action: CheckoutAction): void => {
    const next = reduce(state, action);
    if (next === state) return;

    state = next;
    for (const listener of listeners) listener();
  };

  const later = (action: CheckoutAction): void => schedule(() => dispatch(action), latencyMs);

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    open() {
      dispatch({ type: 'methods/loaded', methods: options.methods });
    },

    handle(intent) {
      switch (intent.type) {
        case 'select-method':
          dispatch({ type: 'method/selected', methodId: intent.methodId });
          return;

        case 'go-back':
          dispatch({ type: 'details/dismissed' });
          return;

        case 'pay': {
          if (state.status !== 'details') return;
          dispatch({ type: 'intent/created', intent: intentFor(state.method.id) });

          if (options.outcome === 'require_action') {
            later({ type: 'action/required', actionUrl: options.challengeUrl });
            return;
          }

          later(
            options.outcome === 'decline'
              ? {
                  type: 'payment/failed',
                  failure: { code: 'declined', message: 'The bank said no.' },
                  retryable: true,
                }
              : { type: 'payment/succeeded', intent: intentFor(state.method.id) },
          );
          return;
        }

        case 'challenge-finished': {
          if (state.status !== 'requires_action') return;
          const settled = state.intent;
          dispatch({ type: 'action/completed' });
          later({ type: 'payment/succeeded', intent: settled });
          return;
        }

        case 'retry':
          dispatch({ type: 'checkout/retried' });
          return;

        case 'dismiss':
          dispatch({ type: 'checkout/reset' });
          dispatch({ type: 'methods/loaded', methods: options.methods });
      }
    },
  };
}
