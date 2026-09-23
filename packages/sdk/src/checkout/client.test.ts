import { PaymentIntentIdSchema, PaymentMethodIdSchema } from '@checkout-embed/contracts';
import type { HttpRequest } from '@checkout-embed/core';
import { describe, expect, it } from 'vitest';
import { createCheckoutApi } from './client.js';

const id = PaymentIntentIdSchema.parse('pi_1');
const methodId = PaymentMethodIdSchema.parse('pm_card');

function recording(status: number, body: unknown) {
  const sent: HttpRequest[] = [];
  const api = createCheckoutApi({
    send: async (request) => {
      sent.push(request);
      return { status, body };
    },
  });
  return { api, sent };
}

describe('createCheckoutApi', () => {
  it('sends the confirm with the idempotency key it was given', async () => {
    const { api, sent } = recording(200, {
      id: 'pi_1',
      status: 'processing',
      money: { amountMinor: 1000, currency: 'EUR' },
      methodId: 'pm_card',
      createdAt: '2026-09-04T10:00:00Z',
    });

    await api.confirmIntent(id, methodId, 'key_1:confirm');

    expect(sent[0]).toMatchObject({
      method: 'POST',
      path: '/v1/payment-intents/pi_1/confirm',
      body: { methodId: 'pm_card' },
      idempotencyKey: 'key_1:confirm',
    });
  });

  it('refuses a challenge address the widget would frame over plain http', async () => {
    const { api } = recording(200, {
      id: 'pi_1',
      status: 'requires_action',
      money: { amountMinor: 1000, currency: 'EUR' },
      methodId: 'pm_card',
      createdAt: '2026-09-04T10:00:00Z',
      actionUrl: 'http://acs.example.com/challenge',
    });

    await expect(api.readIntent(id)).rejects.toMatchObject({ code: 'invalid_message' });
  });

  it.each([
    [401, 'invalid_config', false],
    [429, 'network', true],
    [503, 'network', true],
    [409, 'unknown', false],
  ])('turns a %i into %s', async (status, code, retryable) => {
    const { api } = recording(status, { error: { message: 'no' } });

    await expect(api.readIntent(id)).rejects.toMatchObject({ code, retryable, message: 'no' });
  });
});
