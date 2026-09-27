import {
  MerchantKeySchema,
  MoneySchema,
  PaymentIntentIdSchema,
  PaymentMethodIdSchema,
} from '@checkout-embed/contracts';
import { z } from 'zod';

export const CreateIntentBodySchema = z.object({
  merchantKey: MerchantKeySchema,
  money: MoneySchema,
  methodId: PaymentMethodIdSchema.nullable().default(null),
});

export type CreateIntentBody = z.infer<typeof CreateIntentBodySchema>;

export const ConfirmIntentBodySchema = z.object({
  methodId: PaymentMethodIdSchema,
});

export type ConfirmIntentBody = z.infer<typeof ConfirmIntentBodySchema>;

export const IntentParamsSchema = z.object({ id: PaymentIntentIdSchema });

export type IntentParams = z.infer<typeof IntentParamsSchema>;

const ChallengeTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32}$/);

export const ChallengeQuerySchema = z.object({ token: ChallengeTokenSchema });

export type ChallengeQuery = z.infer<typeof ChallengeQuerySchema>;

export const ChallengeFormSchema = z.object({
  token: ChallengeTokenSchema,
  approved: z.enum(['yes', 'no']),
});

export type ChallengeForm = z.infer<typeof ChallengeFormSchema>;

export const MerchantParamsSchema = z.object({ merchantKey: MerchantKeySchema });

export type MerchantParams = z.infer<typeof MerchantParamsSchema>;

export const ApiErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    detail: z.record(z.string(), z.unknown()).optional(),
  }),
});
