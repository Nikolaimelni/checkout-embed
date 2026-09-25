import type { z } from 'zod';
import { array, int, object, string, url, enum as zEnum } from 'zod';
import { CustomElementNameSchema } from './custom-element.js';
import { MerchantKeySchema } from './identifiers.js';
import { PaymentMethodSchema } from './payment-method.js';
import { IntegritySchema, SecureUrlSchema } from './secure-url.js';

// Intl.NumberFormat throws on a tag like en_US, and the widget formats on first render.
function isLanguageTag(value: string): boolean {
  try {
    return Intl.getCanonicalLocales(value).length === 1;
  } catch {
    return false;
  }
}

/** What a merchant passes that survives JSON. The token callback is the auth adapter's. */
export const CheckoutConfigSchema = object({
  merchantKey: MerchantKeySchema,
  environment: zEnum(['sandbox', 'live']),
  apiBaseUrl: url({ protocol: /^https?$/ }),
  locale: string()
    .refine(isLanguageTag, { error: 'expected a BCP 47 language tag such as en-US' })
    .default('en'),
  /** Custom elements the host renders in place of ours, once they are registered. */
  components: object({
    button: CustomElementNameSchema.optional(),
  }).default({}),
}).refine((config) => config.environment === 'sandbox' || /^https:/i.test(config.apiBaseUrl), {
  error: 'a live checkout has to reach its provider over https',
  path: ['apiBaseUrl'],
});

export type CheckoutConfig = z.infer<typeof CheckoutConfigSchema>;
export type CheckoutConfigInput = z.input<typeof CheckoutConfigSchema>;

/** GET /v1/config/:merchantKey: where the loader finds the bundle. */
export const RemoteWidgetConfigSchema = object({
  bundleUrl: SecureUrlSchema,
  /** Pins the bundle when it is served from a CDN the provider does not run. */
  integrity: IntegritySchema.optional(),
  protocolVersion: int().positive(),
  methods: array(PaymentMethodSchema),
});

export type RemoteWidgetConfig = z.infer<typeof RemoteWidgetConfigSchema>;
