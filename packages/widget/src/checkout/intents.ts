import type { PaymentMethodId } from '@checkout-embed/contracts';

export type WidgetIntent =
  | { readonly type: 'select-method'; readonly methodId: PaymentMethodId }
  | { readonly type: 'go-back' }
  | { readonly type: 'pay' }
  | { readonly type: 'challenge-finished' }
  | { readonly type: 'challenge-dismissed' }
  | { readonly type: 'retry' }
  | { readonly type: 'dismiss' };
