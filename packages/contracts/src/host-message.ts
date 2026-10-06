import type { z } from 'zod';
import { discriminatedUnion, int, literal, object, string } from 'zod';
import { PaymentMethodIdSchema } from './identifiers.js';
import { MoneySchema } from './money.js';

const LimitsSchema = object({
  minMinor: int().nonnegative(),
  maxMinor: int().positive(),
});

export const HostMessageSchema = discriminatedUnion('type', [
  object({
    type: literal('host/update'),
    balance: MoneySchema.nullable().default(null),
    limits: LimitsSchema.nullable().default(null),
    blockingMessage: string().min(1).nullable().default(null),
  }),
  object({
    type: literal('host/select-method'),
    methodId: PaymentMethodIdSchema,
  }),
  object({
    type: literal('host/terminate'),
  }),
]);

export type HostMessage = z.infer<typeof HostMessageSchema>;
export type HostMessageType = HostMessage['type'];
