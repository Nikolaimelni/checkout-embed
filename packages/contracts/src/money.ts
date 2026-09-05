import type { z } from 'zod';
import { int, object, string } from 'zod';

/**
 * Amounts travel as minor units. The only place a decimal is allowed is the formatter
 * in the widget, and even there it is produced, never parsed back.
 */
export const MoneySchema = object({
  amountMinor: int().nonnegative(),
  currency: string().regex(/^[A-Z]{3}$/, { error: 'expected an ISO 4217 alphabetic code' }),
});

export type Money = z.infer<typeof MoneySchema>;
