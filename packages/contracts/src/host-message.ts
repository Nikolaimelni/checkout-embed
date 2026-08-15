import { z } from 'zod';
import { PaymentMethodIdSchema } from './identifiers.js';
import { MoneySchema } from './money.js';

const LimitsSchema = z.object({
  minMinor: z.int().nonnegative(),
  maxMinor: z.int().positive(),
});

/** Host to widget. Everything the merchant can push into a mounted instance. */
export const HostMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('host/update'),
    balance: MoneySchema.nullable().default(null),
    limits: LimitsSchema.nullable().default(null),
    blockingMessage: z.string().min(1).nullable().default(null),
  }),
  z.object({
    type: z.literal('host/select-method'),
    methodId: PaymentMethodIdSchema,
  }),
  z.object({
    type: z.literal('host/terminate'),
  }),
]);

export type HostMessage = z.infer<typeof HostMessageSchema>;
export type HostMessageType = HostMessage['type'];
