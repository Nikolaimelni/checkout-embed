import type { PaymentMethodId } from '@checkout-embed/contracts';

/**
 * What a person did, not what the machine should do about it. The view knows about
 * clicks; deciding that a click means create an intent and then confirm it belongs to
 * whoever owns the network.
 */
export type WidgetIntent =
  | { readonly type: 'select-method'; readonly methodId: PaymentMethodId }
  | { readonly type: 'go-back' }
  | { readonly type: 'pay' }
  | { readonly type: 'challenge-finished' }
  | { readonly type: 'challenge-dismissed' }
  | { readonly type: 'retry' }
  | { readonly type: 'dismiss' };
