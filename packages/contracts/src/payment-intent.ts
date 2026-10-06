import type { z } from 'zod';
import { iso, object, enum as zEnum } from 'zod';
import { PaymentIntentIdSchema, PaymentMethodIdSchema } from './identifiers.js';
import { MoneySchema } from './money.js';
import { SecureUrlSchema } from './secure-url.js';

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
  actionUrl: SecureUrlSchema.nullable().default(null),
});

export type PaymentIntent = z.infer<typeof PaymentIntentSchema>;

const TERMINAL: ReadonlySet<PaymentIntentStatus> = new Set(['succeeded', 'failed', 'canceled']);

export function isTerminalIntentStatus(status: PaymentIntentStatus): boolean {
  return TERMINAL.has(status);
}
