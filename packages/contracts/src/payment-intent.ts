import type { z } from 'zod';
import { iso, object, enum as zEnum } from 'zod';
import { PaymentIntentIdSchema, PaymentMethodIdSchema } from './identifiers.js';
import { MoneySchema } from './money.js';
import { SecureUrlSchema } from './secure-url.js';

/** The provider's status. It describes the money; the widget's own machine describes the screen. */
export const PaymentIntentStatusSchema = zEnum([
  'requires_confirmation',
  'requires_action',
  'processing',
  'succeeded',
  'failed',
  'canceled',
]);

export type PaymentIntentStatus = z.infer<typeof PaymentIntentStatusSchema>;

export const PaymentIntentSchema = object({
  id: PaymentIntentIdSchema,
  status: PaymentIntentStatusSchema,
  money: MoneySchema,
  methodId: PaymentMethodIdSchema.nullable(),
  createdAt: iso.datetime(),
  /** Set only while the status is requires_action. This is where the 3DS challenge lives. */
  actionUrl: SecureUrlSchema.nullable().default(null),
});

export type PaymentIntent = z.infer<typeof PaymentIntentSchema>;

const TERMINAL: ReadonlySet<PaymentIntentStatus> = new Set(['succeeded', 'failed', 'canceled']);

export function isTerminalIntentStatus(status: PaymentIntentStatus): boolean {
  return TERMINAL.has(status);
}
