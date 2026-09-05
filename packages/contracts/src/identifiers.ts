import type { z } from 'zod';
import { string } from 'zod';

/**
 * Branded so that a method id and an intent id cannot be handed to each other's
 * parameter. Both are non-empty strings from the same provider, they appear side by side
 * in almost every call, and the compiler is the only thing that will ever notice the swap.
 */
export const MerchantKeySchema = string().min(1).brand<'MerchantKey'>();
export const PaymentMethodIdSchema = string().min(1).brand<'PaymentMethodId'>();
export const PaymentIntentIdSchema = string().min(1).brand<'PaymentIntentId'>();

export type MerchantKey = z.infer<typeof MerchantKeySchema>;
export type PaymentMethodId = z.infer<typeof PaymentMethodIdSchema>;
export type PaymentIntentId = z.infer<typeof PaymentIntentIdSchema>;
