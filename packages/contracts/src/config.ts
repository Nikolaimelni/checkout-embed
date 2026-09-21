import type { z } from 'zod';
import { array, int, object, string, url, enum as zEnum } from 'zod';
import { CustomElementNameSchema } from './custom-element.js';
import { MerchantKeySchema } from './identifiers.js';
import { PaymentMethodSchema } from './payment-method.js';
import { IntegritySchema, SecureUrlSchema } from './secure-url.js';

// Intl.NumberFormat throws on a malformed tag like en_US, and the widget formats the
// amount in its very first render.
function isLanguageTag(value: string): boolean {
  try {
    return Intl.getCanonicalLocales(value).length === 1;
  } catch {
    return false;
  }
}

/**
 * Everything a merchant can hand us that survives a JSON round trip. The token callback
 * does not, so it is not here: it belongs to the auth adapter, not to the config.
 */
export const CheckoutConfigSchema = object({
  merchantKey: MerchantKeySchema,
  environment: zEnum(['sandbox', 'live']),
  apiBaseUrl: url({ protocol: /^https?$/ }),
  locale: string()
    .refine(isLanguageTag, { error: 'expected a BCP 47 language tag such as en-US' })
    .default('en'),
  /**
   * Components the host would rather render itself. The widget looks each name up in the
   * custom element registry and falls back to its own component when nothing is there.
   */
  components: object({
    button: CustomElementNameSchema.optional(),
  }).default({}),
}).refine((config) => config.environment === 'sandbox' || /^https:/i.test(config.apiBaseUrl), {
  error: 'a live checkout has to reach its provider over https',
  path: ['apiBaseUrl'],
});

export type CheckoutConfig = z.infer<typeof CheckoutConfigSchema>;
export type CheckoutConfigInput = z.input<typeof CheckoutConfigSchema>;

/**
 * The answer from GET /v1/config/:merchantKey. The loader takes the bundle address from
 * here, so a fix ships without merchants editing their tag.
 */
export const RemoteWidgetConfigSchema = object({
  bundleUrl: SecureUrlSchema,
  /** Pins the bundle when it is served from a CDN the provider does not run. */
  integrity: IntegritySchema.optional(),
  protocolVersion: int().positive(),
  methods: array(PaymentMethodSchema),
});

export type RemoteWidgetConfig = z.infer<typeof RemoteWidgetConfigSchema>;
