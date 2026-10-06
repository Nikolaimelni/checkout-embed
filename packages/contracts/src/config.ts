import type { z } from 'zod';
import { array, int, object, string, url, enum as zEnum } from 'zod';
import { CustomElementNameSchema } from './custom-element.js';
import { MerchantKeySchema } from './identifiers.js';
import { PaymentMethodSchema } from './payment-method.js';
import { IntegritySchema, SecureUrlSchema } from './secure-url.js';

function isLanguageTag(value: string): boolean {
  try {
    return Intl.getCanonicalLocales(value).length === 1;
  } catch {
    return false;
  }
}

export const CheckoutConfigSchema = object({
  merchantKey: MerchantKeySchema,
  environment: zEnum(['sandbox', 'live']),
  apiBaseUrl: url({ protocol: /^https?$/ }),
  locale: string()
    .refine(isLanguageTag, { error: 'expected a BCP 47 language tag such as en-US' })
    .default('en'),
  components: object({
    button: CustomElementNameSchema.optional(),
  }).default({}),
}).refine((config) => config.environment === 'sandbox' || /^https:/i.test(config.apiBaseUrl), {
  error: 'a live checkout has to reach its provider over https',
  path: ['apiBaseUrl'],
});

export type CheckoutConfig = z.infer<typeof CheckoutConfigSchema>;
export type CheckoutConfigInput = z.input<typeof CheckoutConfigSchema>;

export const RemoteWidgetConfigSchema = object({
  bundleUrl: SecureUrlSchema,
  integrity: IntegritySchema.optional(),
  protocolVersion: int().positive(),
  methods: array(PaymentMethodSchema),
});

export type RemoteWidgetConfig = z.infer<typeof RemoteWidgetConfigSchema>;
