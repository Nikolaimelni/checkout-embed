import type { PaymentMethodId } from '@checkout-embed/contracts';

/** What a person did. Turning that into HTTP calls is the controller's job. */
export type WidgetIntent =
  | { readonly type: 'select-method'; readonly methodId: PaymentMethodId }
  | { readonly type: 'go-back' }
  | { readonly type: 'pay' }
  | { readonly type: 'challenge-finished' }
  | { readonly type: 'challenge-dismissed' }
  | { readonly type: 'retry' }
  | { readonly type: 'dismiss' };
