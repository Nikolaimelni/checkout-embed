import { z } from 'zod';
import { PaymentMethodIdSchema } from './identifiers.js';

export const PaymentMethodKindSchema = z.enum(['card', 'saved_card', 'apple_pay', 'google_pay']);

export type PaymentMethodKind = z.infer<typeof PaymentMethodKindSchema>;

export const PaymentMethodSchema = z.object({
  id: PaymentMethodIdSchema,
  kind: PaymentMethodKindSchema,
  label: z.string().min(1),
  brand: z.string().min(1).optional(),
  last4: z
    .string()
    .regex(/^\d{4}$/, { error: 'expected exactly four digits' })
    .optional(),
});

export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;
