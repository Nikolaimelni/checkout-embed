import { z } from 'zod';

export const CheckoutErrorCodeSchema = z.enum([
  'network',
  'timeout',
  'declined',
  'invalid_config',
  'invalid_message',
  'protocol_mismatch',
  'action_abandoned',
  'unknown',
]);

export type CheckoutErrorCode = z.infer<typeof CheckoutErrorCodeSchema>;

/**
 * The serialisable shape of a failure. Errors thrown inside the widget are class
 * instances; anything that crosses the host boundary is flattened to this.
 */
export const CheckoutFailureSchema = z.object({
  code: CheckoutErrorCodeSchema,
  message: z.string().min(1),
});

export type CheckoutFailure = z.infer<typeof CheckoutFailureSchema>;
