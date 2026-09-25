import type { z } from 'zod';
import { object, string, enum as zEnum } from 'zod';

export const CheckoutErrorCodeSchema = zEnum([
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

/** A failure as it crosses the host boundary. Inside the widget it is a CheckoutError. */
export const CheckoutFailureSchema = object({
  code: CheckoutErrorCodeSchema,
  message: string().min(1),
});

export type CheckoutFailure = z.infer<typeof CheckoutFailureSchema>;
