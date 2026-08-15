import { z } from 'zod';
import { CustomElementNameSchema } from './custom-element.js';
import { MerchantKeySchema } from './identifiers.js';
import { PaymentMethodSchema } from './payment-method.js';

/**
 * Everything a merchant can hand us that survives a JSON round trip. The token callback
 * does not, so it is not here: it belongs to the auth adapter, not to the config.
 */
export const CheckoutConfigSchema = z.object({
  merchantKey: MerchantKeySchema,
  environment: z.enum(['sandbox', 'live']),
  apiBaseUrl: z.url(),
  locale: z.string().min(2).default('en'),
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  /**
   * Components the host would rather render itself. The widget looks each name up in the
   * custom element registry and falls back to its own component when nothing is there.
   */
  components: z
    .object({
      button: CustomElementNameSchema.optional(),
    })
    .default({}),
});

export type CheckoutConfig = z.infer<typeof CheckoutConfigSchema>;
export type CheckoutConfigInput = z.input<typeof CheckoutConfigSchema>;

/**
 * The answer from GET /v1/config/:merchantKey. This is what lets the loader resolve its
 * own bundle from the backend instead of a constant baked in at build time, which is the
 * difference between shipping a fix and asking every merchant to redeploy.
 */
export const RemoteWidgetConfigSchema = z.object({
  bundleUrl: z.url(),
  protocolVersion: z.int().positive(),
  methods: z.array(PaymentMethodSchema),
});

export type RemoteWidgetConfig = z.infer<typeof RemoteWidgetConfigSchema>;
