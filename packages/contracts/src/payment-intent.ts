import type { z } from 'zod';
import { iso, object, url, enum as zEnum } from 'zod';
import { PaymentIntentIdSchema, PaymentMethodIdSchema } from './identifiers.js';
import { MoneySchema } from './money.js';

/**
 * Provider-side status. Deliberately not the same vocabulary as the widget's own state
 * machine: one describes the money, the other describes the screen.
 */
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
  actionUrl: url().nullable().default(null),
});

export type PaymentIntent = z.infer<typeof PaymentIntentSchema>;

const TERMINAL: ReadonlySet<PaymentIntentStatus> = new Set(['succeeded', 'failed', 'canceled']);

export function isTerminalIntentStatus(status: PaymentIntentStatus): boolean {
  return TERMINAL.has(status);
}
