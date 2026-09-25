import type {
  CheckoutFailure,
  PaymentIntent,
  PaymentMethod,
  PaymentMethodId,
} from '@checkout-embed/contracts';

export type CheckoutStatus =
  | 'idle'
  | 'methods'
  | 'details'
  | 'confirming'
  | 'requires_action'
  | 'polling'
  | 'succeeded'
  | 'failed';

/** Each state carries only what its screen needs. failed keeps the methods for a retry. */
export type CheckoutState =
  | { readonly status: 'idle' }
  | { readonly status: 'methods'; readonly methods: readonly PaymentMethod[] }
  | {
      readonly status: 'details';
      readonly methods: readonly PaymentMethod[];
      readonly method: PaymentMethod;
    }
  | {
      readonly status: 'confirming';
      readonly methods: readonly PaymentMethod[];
      readonly method: PaymentMethod;
      readonly intent: PaymentIntent;
    }
  | {
      readonly status: 'requires_action';
      readonly methods: readonly PaymentMethod[];
      readonly method: PaymentMethod;
      readonly intent: PaymentIntent;
      readonly actionUrl: string;
    }
  | {
      readonly status: 'polling';
      readonly methods: readonly PaymentMethod[];
      readonly method: PaymentMethod;
      readonly intent: PaymentIntent;
      readonly attempt: number;
    }
  | { readonly status: 'succeeded'; readonly intent: PaymentIntent }
  | {
      readonly status: 'failed';
      readonly methods: readonly PaymentMethod[];
      readonly failure: CheckoutFailure;
      readonly retryable: boolean;
    };

export type CheckoutAction =
  | { readonly type: 'methods/loaded'; readonly methods: readonly PaymentMethod[] }
  | { readonly type: 'method/selected'; readonly methodId: PaymentMethodId }
  | { readonly type: 'details/dismissed' }
  | { readonly type: 'intent/created'; readonly intent: PaymentIntent }
  | { readonly type: 'action/required'; readonly actionUrl: string }
  | { readonly type: 'poll/started' }
  | { readonly type: 'poll/tick'; readonly intent: PaymentIntent }
  | { readonly type: 'payment/succeeded'; readonly intent: PaymentIntent }
  | {
      readonly type: 'payment/failed';
      readonly failure: CheckoutFailure;
      readonly retryable: boolean;
    }
  | { readonly type: 'checkout/retried' }
  | { readonly type: 'checkout/reset' };

export type CheckoutActionType = CheckoutAction['type'];

export const INITIAL_STATE: CheckoutState = { status: 'idle' };
