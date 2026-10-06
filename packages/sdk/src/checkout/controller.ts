import {
  isTerminalIntentStatus,
  type MerchantKey,
  type Money,
  type PaymentIntent,
  type PaymentIntentId,
  type PaymentIntentStatus,
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

const LIVE: ReadonlySet<PaymentIntentStatus> = new Set([
  'requires_action',
  'processing',
  'succeeded',
]);

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
  start(): void;
  dispose(): void;
};

type Attempt = {
  readonly key: string;
  readonly methodId: PaymentMethodId;
  readonly abort: AbortController;
  intentId: PaymentIntentId | null;
  busy: boolean;
};

export function createCheckoutController(options: ControllerOptions): CheckoutController {
  const { api, events, merchantKey, total } = options;
  const logger = options.logger ?? silentLogger;
  const reduce = createCheckoutReducer({ logger });
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const newIdempotencyKey = options.newIdempotencyKey ?? (() => crypto.randomUUID());
  // why: browsers hand back a number and Node a Timeout object; only clearTimeout reads it.
  const setTimer = options.setTimer ?? ((run, ms) => setTimeout(run, ms) as unknown as number);
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle));

  const listeners = new Set<() => void>();
  const lifetime = new AbortController();

  let state: CheckoutState = INITIAL_STATE;
  let disposed = false;
  let pollHandle: number | null = null;
  let attempt: Attempt | null = null;

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

  function dispatch(action: CheckoutAction): boolean {
    if (disposed) return false;

    const next = reduce(state, action);
    if (next === state) return false;

    const previous = state;
    state = next;
    for (const listener of listeners) listener();

    announce(previous, next);
    return true;
  }

  function fail(cause: unknown): void {
    logger.log('warn', 'checkout: the attempt did not complete', { cause });
    dispatch({
      type: 'payment/failed',
      failure: toFailure(cause),
      retryable: isCheckoutError(cause) ? cause.retryable : false,
    });
  }

  function run(work: () => Promise<void>, owner: Attempt | null = null): void {
    void work().catch((cause: unknown) => {
      if (disposed || owner?.abort.signal.aborted) return;
      fail(cause);
    });
  }

  function attemptFor(methodId: PaymentMethodId): Attempt {
    const kept = attempt?.methodId === methodId ? attempt : null;
    attempt = {
      key: kept?.key ?? newIdempotencyKey(),
      methodId,
      abort: new AbortController(),
      intentId: kept?.intentId ?? null,
      busy: false,
    };
    return attempt;
  }

  function abandonRequests(): void {
    if (attempt === null) return;
    attempt.abort.abort();
    attempt.busy = false;
  }

  function stopPolling(): void {
    if (pollHandle === null) return;
    clearTimer(pollHandle);
    pollHandle = null;
  }

  function settle(): void {
    attempt = null;
    stopPolling();
  }

  function loadMethods(): void {
    run(async () => {
      const config = await api.loadConfig(merchantKey, lifetime.signal);
      if (!dispatch({ type: 'methods/loaded', methods: config.methods })) return;

      if (options.preselectedMethodId !== undefined) {
        dispatch({ type: 'method/selected', methodId: options.preselectedMethodId });
      }
    });
  }

  function startPolling(id: PaymentIntentId): void {
    stopPolling();

    const tick = (): void => {
      pollHandle = null;
      run(async () => {
        const intent = await api.readIntent(id, lifetime.signal);
        if (isTerminalIntentStatus(intent.status)) {
          apply(intent);
          return;
        }

        if (dispatch({ type: 'poll/tick', intent }) && state.status === 'polling') schedule();
      });
    };

    const schedule = (): void => {
      if (disposed) return;
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
        if (dispatch({ type: 'poll/started' })) startPolling(intent.id);
        return;

      case 'succeeded':
        settle();
        dispatch({ type: 'payment/succeeded', intent });
        return;

      case 'failed':
      case 'canceled':
        settle();
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
        return;
    }
  }

  async function resumed(intentId: PaymentIntentId, current: Attempt): Promise<boolean> {
    const intent = await api.readIntent(intentId, current.abort.signal);
    if (current.abort.signal.aborted) return true;
    if (!LIVE.has(intent.status)) return false;

    current.intentId = intent.id;
    if (dispatch({ type: 'intent/created', intent })) apply(intent);
    return true;
  }

  function pay(): void {
    if (state.status !== 'details' || attempt?.busy) return;

    const method = state.method;
    const earlier = attempt !== null && attempt.methodId !== method.id ? attempt : null;
    const current = attemptFor(method.id);
    current.busy = true;

    run(async () => {
      try {
        // a new method means a new intent, so first make sure the old one is not still settling
        if (earlier?.intentId && (await resumed(earlier.intentId, current))) return;

        const created = await api.createIntent(
          { merchantKey, money: total, methodId: method.id },
          current.key,
          current.abort.signal,
        );
        if (current.abort.signal.aborted) return;
        current.intentId = created.id;

        if (!dispatch({ type: 'intent/created', intent: created })) return;

        // a replayed key can return an intent that was already confirmed
        if (created.status !== 'requires_confirmation') {
          apply(created);
          return;
        }

        const confirmed = await api.confirmIntent(
          created.id,
          method.id,
          `${current.key}:confirm`,
          current.abort.signal,
        );
        if (!current.abort.signal.aborted) apply(confirmed);
      } finally {
        current.busy = false;
      }
    }, current);
  }

  function retry(): void {
    const pending = attempt;
    abandonRequests();
    if (!dispatch({ type: 'checkout/retried' })) return;

    const intentId = pending?.intentId ?? null;
    if (pending === null || intentId === null || !reopen(pending.methodId)) {
      loadMethods();
      return;
    }

    const resumed = attemptFor(pending.methodId);
    resumed.busy = true;

    run(async () => {
      try {
        const intent = await api.readIntent(intentId, resumed.abort.signal);
        if (resumed.abort.signal.aborted) return;

        if (intent.status === 'requires_confirmation') return;
        if (dispatch({ type: 'intent/created', intent })) apply(intent);
      } finally {
        resumed.busy = false;
      }
    }, resumed);
  }

  function reopen(methodId: PaymentMethodId): boolean {
    return dispatch({ type: 'method/selected', methodId });
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    start: loadMethods,

    handle(intent) {
      switch (intent.type) {
        case 'select-method':
          dispatch({ type: 'method/selected', methodId: intent.methodId });
          return;

        case 'go-back':
          abandonRequests();
          dispatch({ type: 'details/dismissed' });
          return;

        case 'pay':
          pay();
          return;

        case 'challenge-finished': {
          if (state.status !== 'requires_action') return;
          const id = state.intent.id;
          if (dispatch({ type: 'poll/started' })) startPolling(id);
          return;
        }

        case 'challenge-dismissed':
          if (state.status !== 'requires_action') return;
          dispatch({
            type: 'payment/failed',
            failure: {
              code: 'action_abandoned',
              message: 'The bank check was closed before it finished.',
            },
            retryable: true,
          });
          return;

        case 'retry':
          retry();
          return;

        // Close keeps the attempt: a timed out payment can still settle
        case 'dismiss':
          abandonRequests();
          stopPolling();
          if (dispatch({ type: 'checkout/reset' })) loadMethods();
      }
    },

    dispose() {
      disposed = true;
      abandonRequests();
      lifetime.abort();
      stopPolling();
      listeners.clear();
    },
  };
}
