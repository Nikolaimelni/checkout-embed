import { z } from 'zod';
import { CheckoutFailureSchema } from './failure.js';
import { PaymentIntentIdSchema, PaymentMethodIdSchema } from './identifiers.js';
import { MoneySchema } from './money.js';

/** Widget to host. The public event surface a merchant subscribes to. */
export const WidgetEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('widget:ready') }),
  z.object({ type: z.literal('widget:resize'), height: z.int().nonnegative() }),
  z.object({ type: z.literal('method:selected'), methodId: PaymentMethodIdSchema }),
  z.object({
    type: z.literal('payment:success'),
    intentId: PaymentIntentIdSchema,
    money: MoneySchema,
  }),
  z.object({ type: z.literal('payment:error'), failure: CheckoutFailureSchema }),
]);

export type WidgetEvent = z.infer<typeof WidgetEventSchema>;
export type WidgetEventType = WidgetEvent['type'];
