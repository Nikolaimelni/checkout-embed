import type { PaymentMethod } from '@checkout-embed/contracts';
import { type Logger, silentLogger } from '../adapters/logger.js';
import type { CheckoutAction, CheckoutState } from './state.js';

/** A minute and a half at the SDK's 1.5 s interval, plus however long the reads take. */
export const DEFAULT_MAX_POLL_ATTEMPTS = 60;

type Applied = { readonly next: CheckoutState } | { readonly dropped: string };

export type CheckoutReducerOptions = {
  readonly logger?: Logger;
  readonly maxPollAttempts?: number;
};

export type CheckoutReducer = (state: CheckoutState, action: CheckoutAction) => CheckoutState;

function noTransition(state: CheckoutState, action: CheckoutAction): Applied {
  return { dropped: `no transition from ${state.status} on ${action.type}` };
}

function failed(
  methods: readonly PaymentMethod[],
  action: Extract<CheckoutAction, { type: 'payment/failed' }>,
): CheckoutState {
  return {
    status: 'failed',
    methods,
    failure: action.failure,
    retryable: action.retryable,
  };
}

function apply(state: CheckoutState, action: CheckoutAction, maxPollAttempts: number): Applied {
  switch (state.status) {
    case 'idle':
      switch (action.type) {
        case 'methods/loaded':
          return { next: { status: 'methods', methods: action.methods } };
        // A provider that is down before the list ever loads still has to say so. Without
        // this the widget sits on its loading line for as long as the page is open.
        case 'payment/failed':
          return { next: failed([], action) };
        default:
          return noTransition(state, action);
      }

    case 'methods':
      switch (action.type) {
        case 'methods/loaded':
          return { next: { status: 'methods', methods: action.methods } };
        case 'method/selected': {
          const method = state.methods.find((candidate) => candidate.id === action.methodId);
          return method
            ? { next: { status: 'details', methods: state.methods, method } }
            : { dropped: `no method with id ${action.methodId}` };
        }
        case 'payment/failed':
          return { next: failed(state.methods, action) };
        default:
          return noTransition(state, action);
      }

    case 'details':
      switch (action.type) {
        case 'intent/created':
          return {
            next: {
              status: 'confirming',
              methods: state.methods,
              method: state.method,
              intent: action.intent,
            },
          };
        case 'details/dismissed':
          return { next: { status: 'methods', methods: state.methods } };
        case 'payment/failed':
          return { next: failed(state.methods, action) };
        default:
          return noTransition(state, action);
      }

    case 'confirming':
      switch (action.type) {
        // The provider answered 'processing' rather than handing back a challenge. There
        // is nothing for anyone to do but wait, which is the same waiting the machine
        // already knows how to do after a challenge.
        case 'poll/started':
          return {
            next: {
              status: 'polling',
              methods: state.methods,
              method: state.method,
              intent: state.intent,
              attempt: 0,
            },
          };
        case 'action/required':
          return {
            next: {
              status: 'requires_action',
              methods: state.methods,
              method: state.method,
              intent: state.intent,
              actionUrl: action.actionUrl,
            },
          };
        case 'payment/succeeded':
          return { next: { status: 'succeeded', intent: action.intent } };
        case 'payment/failed':
          return { next: failed(state.methods, action) };
        default:
          return noTransition(state, action);
      }

    case 'requires_action':
      switch (action.type) {
        case 'poll/started':
          return {
            next: {
              status: 'polling',
              methods: state.methods,
              method: state.method,
              intent: state.intent,
              attempt: 0,
            },
          };
        case 'payment/failed':
          return { next: failed(state.methods, action) };
        default:
          return noTransition(state, action);
      }

    case 'polling':
      switch (action.type) {
        case 'poll/tick': {
          const attempt = state.attempt + 1;
          if (attempt > maxPollAttempts) {
            return {
              next: {
                status: 'failed',
                methods: state.methods,
                failure: { code: 'timeout', message: 'The payment did not settle in time.' },
                retryable: true,
              },
            };
          }
          return {
            next: {
              status: 'polling',
              methods: state.methods,
              method: state.method,
              intent: action.intent,
              attempt,
            },
          };
        }
        case 'payment/succeeded':
          return { next: { status: 'succeeded', intent: action.intent } };
        case 'payment/failed':
          return { next: failed(state.methods, action) };
        default:
          return noTransition(state, action);
      }

    case 'succeeded':
      return action.type === 'checkout/reset'
        ? { next: { status: 'idle' } }
        : noTransition(state, action);

    case 'failed':
      switch (action.type) {
        case 'checkout/retried':
          return state.retryable
            ? { next: { status: 'methods', methods: state.methods } }
            : { dropped: 'the failure is not retryable' };
        case 'checkout/reset':
          return { next: { status: 'idle' } };
        default:
          return noTransition(state, action);
      }
  }
}

/**
 * A pure reducer with one injected port. An action the current state has no transition
 * for is dropped and logged, never applied halfway: this is the difference between a
 * widget that shows the wrong screen and one that shows the same screen twice.
 *
 * Dropping returns the state by identity, so a React consumer bails out of the render.
 */
export function createCheckoutReducer(options: CheckoutReducerOptions = {}): CheckoutReducer {
  const logger = options.logger ?? silentLogger;
  const maxPollAttempts = options.maxPollAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS;

  return (state, action) => {
    const result = apply(state, action, maxPollAttempts);
    if ('next' in result) return result.next;

    logger.log('warn', 'checkout: action dropped', {
      status: state.status,
      action: action.type,
      why: result.dropped,
    });
    return state;
  };
}
