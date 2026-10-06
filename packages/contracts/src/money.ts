import type { z } from 'zod';
import { int, object, string } from 'zod';

export const MoneySchema = object({
  amountMinor: int().nonnegative(),
  currency: string().regex(/^[A-Z]{3}$/, { error: 'expected an ISO 4217 alphabetic code' }),
});

export type Money = z.infer<typeof MoneySchema>;
