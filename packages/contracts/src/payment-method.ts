import type { z } from 'zod';
import { object, string, enum as zEnum } from 'zod';
import { PaymentMethodIdSchema } from './identifiers.js';

export const PaymentMethodKindSchema = zEnum(['card', 'saved_card', 'apple_pay', 'google_pay']);

export type PaymentMethodKind = z.infer<typeof PaymentMethodKindSchema>;

export const PaymentMethodSchema = object({
  id: PaymentMethodIdSchema,
  kind: PaymentMethodKindSchema,
  label: string().min(1),
  brand: string().min(1).optional(),
  last4: string()
    .regex(/^\d{4}$/, { error: 'expected exactly four digits' })
    .optional(),
});

export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;
