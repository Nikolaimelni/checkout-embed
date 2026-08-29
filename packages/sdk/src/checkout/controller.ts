import {
  isTerminalIntentStatus,
  type MerchantKey,
  type Money,
  type PaymentIntent,
  type PaymentIntentId,
  type PaymentMethodId,
} from '@checkout-embed/contracts';
import {
  type CheckoutAction,
  CheckoutError,
  type CheckoutState,
  createCheckoutReducer,
  type EventBus,
  INITIAL_STATE,
  isCheckoutError,
  type Logger,
  silentLogger,
  toFailure,
} from '@checkout-embed/core';
import type { WidgetIntent, WidgetStore } from '@checkout-embed/widget';
import type { CheckoutApi } from './client.js';

export const DEFAULT_POLL_INTERVAL_MS = 1_500;

export type ControllerOptions = {
  readonly api: CheckoutApi;
  readonly merchantKey: MerchantKey;
  readonly total: Money;
  readonly events: EventBus;
  readonly logger?: Logger | undefined;
  readonly preselectedMethodId?: PaymentMethodId | undefined;
  readonly pollIntervalMs?: number;
  readonly newIdempotencyKey?: () => string;
  readonly setTimer?: (run: () => void, ms: number) => number;
  readonly clearTimer?: (handle: number) => void;
};

export type CheckoutController = WidgetStore & {
  handle(intent: WidgetIntent): void;
  /** Loads the method list. Separate from construction so a caller can mount first. */
  start(): void;
  dispose(): void;
};

/**
 * The other half of the widget. The widget knows what somebody clicked; this knows what
 * that costs in HTTP calls, and the reducer in core knows which screen the answer leads
 * to. None of the three knows the other two's business.
 */
export function createCheckoutController(options: ControllerOptions): CheckoutController {
  const { api, events, merchantKey, total } = options;
  const logger = options.logger ?? silentLogger;
  const reduce = createCheckoutReducer({ logger });
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const newIdempotencyKey = options.newIdempotencyKey ?? (() => crypto.randomUUID());
  const setTimer = options.setTimer ?? ((run, ms) => setTimeout(run, ms) as unknown as number);
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle));

  const listeners = new Set<() => void>();

  let state: CheckoutState = INITIAL_STATE;
  let disposed = false;
  let pollHandle: number | null = null;
  /**
   * Held for the length of one attempt to pay. A retry after a dropped connection replays
   * the same key and gets the same intent back rather than charging twice; giving up and
   * starting over gets a new one.
   */
  let attemptKey: string | null = null;

  function announce(previous: CheckoutState, next: CheckoutState): void {
    if (next.status === 'details' && previous.status !== 'details') {
      events.emit({ type: 'method:selected', methodId: next.method.id });
    }

    if (next.status === 'succeeded') {
      events.emit({
        type: 'payment:success',
        intentId: next.intent.id,
        money: next.intent.money,
      });
    }

    if (next.status === 'failed' && previous.status !== 'failed') {
      events.emit({ type: 'payment:error', failure: next.failure });
    }
  }

  function dispatch(action: CheckoutAction): void {
    if (disposed) return;

    const next = reduce(state, action);
    if (next === state) return;

    const previous = state;
    state = next;
    for (const listener of listeners) listener();

    // Events are derived from where the machine landed, not from the call site that got it
    // there. A payment that times out during polling fails inside the reducer, and this is
    // what makes the merchant hear about that one too.
    announce(previous, next);
  }

  function fail(cause: unknown): void {
    logger.log('warn', 'checkout: the attempt did not complete', { cause });
    dispatch({
      type: 'payment/failed',
      failure: toFailure(cause),
      retryable: isCheckoutError(cause) ? cause.retryable : false,
    });
  }

  function run(work: () => Promise<void>): void {
    void work().catch((cause: unknown) => {
      if (!disposed) fail(cause);
    });
  }

  function stopPolling(): void {
    if (pollHandle === null) return;
    clearTimer(pollHandle);
    pollHandle = null;
  }

  function startPolling(id: PaymentIntentId): void {
    stopPolling();

    const tick = (): void => {
      pollHandle = null;
      run(async () => {
        const intent = await api.readIntent(id);
        if (isTerminalIntentStatus(intent.status)) {
          apply(intent);
          return;
        }

        dispatch({ type: 'poll/tick', intent });
        // The reducer gives up on its own once the budget is spent, which lands the
        // machine somewhere other than polling and ends this loop.
        if (state.status === 'polling') schedule();
      });
    };

    const schedule = (): void => {
      pollHandle = setTimer(tick, pollIntervalMs);
    };

    schedule();
  }

  function apply(intent: PaymentIntent): void {
    switch (intent.status) {
      case 'requires_action': {
        if (intent.actionUrl === null) {
          fail(
            new CheckoutError(
              'invalid_message',
              'The provider asked for a challenge without saying where it is.',
            ),
          );
          return;
        }
        dispatch({ type: 'action/required', actionUrl: intent.actionUrl });
        return;
      }

      case 'processing':
        dispatch({ type: 'poll/started' });
        startPolling(intent.id);
        return;

      case 'succeeded':
        attemptKey = null;
        stopPolling();
        dispatch({ type: 'payment/succeeded', intent });
        return;

      case 'failed':
      case 'canceled':
        attemptKey = null;
        stopPolling();
        dispatch({
          type: 'payment/failed',
          failure: {
            code: 'declined',
            message:
              intent.status === 'canceled'
                ? 'The payment was cancelled.'
                : 'The payment was declined.',
          },
          retryable: true,
        });
        return;

      case 'requires_confirmation':
        // Nothing has happened to it yet. The confirm call is what moves it on.
        return;
    }
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    start() {
      run(async () => {
        const config = await api.loadConfig(merchantKey);
        dispatch({ type: 'methods/loaded', methods: config.methods });

        if (options.preselectedMethodId !== undefined) {
          dispatch({ type: 'method/selected', methodId: options.preselectedMethodId });
        }
      });
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
          const method = state.method;
          attemptKey = attemptKey ?? newIdempotencyKey();

          run(async () => {
            const created = await api.createIntent(
              { merchantKey, money: total, methodId: method.id },
              attemptKey as string,
            );
            dispatch({ type: 'intent/created', intent: created });
            apply(await api.confirmIntent(created.id, method.id));
          });
          return;
        }

        case 'challenge-finished': {
          if (state.status !== 'requires_action') return;
          const id = state.intent.id;
          dispatch({ type: 'poll/started' });
          startPolling(id);
          return;
        }

        case 'retry':
          attemptKey = null;
          dispatch({ type: 'checkout/retried' });
          // The list may be stale, or empty because loading it is what failed.
          this.start();
          return;

        case 'dismiss':
          attemptKey = null;
          stopPolling();
          dispatch({ type: 'checkout/reset' });
          this.start();
      }
    },

    dispose() {
      disposed = true;
      stopPolling();
      listeners.clear();
    },
  };
}
