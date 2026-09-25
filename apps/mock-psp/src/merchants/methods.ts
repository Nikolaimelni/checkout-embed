import { type PaymentMethod, PaymentMethodSchema } from '@checkout-embed/contracts';
import { z } from 'zod';

export const SUPPORTED_METHODS: readonly PaymentMethod[] = z.array(PaymentMethodSchema).parse([
  { id: 'pm_card', kind: 'card', label: 'Card' },
  { id: 'pm_apple_pay', kind: 'apple_pay', label: 'Apple Pay' },
  {
    id: 'pm_saved_visa',
    kind: 'saved_card',
    label: 'Visa ending 4242',
    brand: 'visa',
    last4: '4242',
  },
]);
