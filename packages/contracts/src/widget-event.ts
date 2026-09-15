import type { z } from 'zod';
import { discriminatedUnion, literal, object } from 'zod';
import { CheckoutFailureSchema } from './failure.js';
import { PaymentIntentIdSchema, PaymentMethodIdSchema } from './identifiers.js';
import { MoneySchema } from './money.js';

/** Widget to host. The public event surface a merchant subscribes to. */
export const WidgetEventSchema = discriminatedUnion('type', [
  object({ type: literal('widget:ready') }),
  object({ type: literal('method:selected'), methodId: PaymentMethodIdSchema }),
  object({
    type: literal('payment:success'),
    intentId: PaymentIntentIdSchema,
    money: MoneySchema,
  }),
  object({ type: literal('payment:error'), failure: CheckoutFailureSchema }),
]);

export type WidgetEvent = z.infer<typeof WidgetEventSchema>;
export type WidgetEventType = WidgetEvent['type'];
