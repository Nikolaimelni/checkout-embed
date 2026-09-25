import type { z } from 'zod';
import { string } from 'zod';

/** Branded, so a method id cannot be passed where an intent id is expected. */
export const MerchantKeySchema = string().min(1).brand<'MerchantKey'>();
export const PaymentMethodIdSchema = string().min(1).brand<'PaymentMethodId'>();
export const PaymentIntentIdSchema = string().min(1).brand<'PaymentIntentId'>();

export type MerchantKey = z.infer<typeof MerchantKeySchema>;
export type PaymentMethodId = z.infer<typeof PaymentMethodIdSchema>;
export type PaymentIntentId = z.infer<typeof PaymentIntentIdSchema>;
