import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BEARER,
  createHarness,
  type Harness,
  intentBody,
  MERCHANT_KEY,
} from '../testing/harness.ts';
import { SETTLE_DELAY_MS } from './triggers.ts';

const SUCCEEDS = 1000;
const DECLINES = 1051;
const NEEDS_3DS = 1003;
const NEVER_SETTLES = 1099;

let harness: Harness;

beforeEach(async () => {
  harness = await createHarness();
});

afterEach(() => {
  harness.close();
});

const post = (path: string) => request(harness.app).post(path).set('authorization', BEARER);
const get = (path: string) => request(harness.app).get(path).set('authorization', BEARER);

async function createIntent(amountMinor: number, key = `key_${amountMinor}`) {
  const response = await post('/v1/payment-intents')
    .set('idempotency-key', key)
    .send(intentBody(amountMinor));

  expect(response.status).toBe(201);
  return response.body as { id: string; status: string; actionUrl: string | null };
}

describe('POST /v1/payment-intents', () => {
  it('refuses a request without a bearer token', async () => {
    const response = await request(harness.app)
      .post('/v1/payment-intents')
      .set('idempotency-key', 'key_1')
      .send(intentBody(SUCCEEDS));

    expect(response.status).toBe(401);
  });

  it('refuses a request without an idempotency key, because it moves money', async () => {
    const response = await post('/v1/payment-intents').send(intentBody(SUCCEEDS));

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('Idempotency-Key');
  });

  it('creates an intent that still needs confirming', async () => {
    const intent = await createIntent(SUCCEEDS);

    expect(intent).toMatchObject({ status: 'requires_confirmation', actionUrl: null });
    expect(intent.id).toMatch(/^pi_/);
  });

  it('replays the original intent when the same key comes back with the same body', async () => {
    const first = await createIntent(SUCCEEDS, 'key_replay');

    const second = await post('/v1/payment-intents')
      .set('idempotency-key', 'key_replay')
      .send(intentBody(SUCCEEDS));

    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.id);
  });

  it('answers 409 when the same key comes back with a different body', async () => {
    await createIntent(SUCCEEDS, 'key_conflict');

    const second = await post('/v1/payment-intents')
      .set('idempotency-key', 'key_conflict')
      .send(intentBody(DECLINES));

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('idempotency_conflict');
  });

  it('gives different keys different intents', async () => {
    const first = await createIntent(SUCCEEDS, 'key_a');
    const second = await createIntent(SUCCEEDS, 'key_b');

    expect(first.id).not.toBe(second.id);
  });

  it.each([
    [
      'a fractional amount',
      { merchantKey: MERCHANT_KEY, money: { amountMinor: 10.5, currency: 'EUR' } },
    ],
    [
      'a negative amount',
      { merchantKey: MERCHANT_KEY, money: { amountMinor: -100, currency: 'EUR' } },
    ],
    [
      'a lowercase currency',
      { merchantKey: MERCHANT_KEY, money: { amountMinor: 100, currency: 'eur' } },
    ],
    ['no merchant key', { money: { amountMinor: 100, currency: 'EUR' } }],
  ])('rejects %s', async (_label, body) => {
    const response = await post('/v1/payment-intents').set('idempotency-key', 'key_bad').send(body);

    expect(response.status).toBe(400);
  });
});

describe('POST /v1/payment-intents/:id/confirm', () => {
  it('puts a plain payment into processing and settles it after the delay', async () => {
    const intent = await createIntent(SUCCEEDS);

    const confirmed = await post(`/v1/payment-intents/${intent.id}/confirm`).send({
      methodId: 'pm_card',
    });
    expect(confirmed.body.status).toBe('processing');

    const early = await get(`/v1/payment-intents/${intent.id}`);
    expect(early.body.status).toBe('processing');

    harness.clock.advance(SETTLE_DELAY_MS);
    const settled = await get(`/v1/payment-intents/${intent.id}`);
    expect(settled.body.status).toBe('succeeded');
  });

  it('fails the declining amount straight away', async () => {
    const intent = await createIntent(DECLINES);

    const confirmed = await post(`/v1/payment-intents/${intent.id}/confirm`).send({
      methodId: 'pm_card',
    });

    expect(confirmed.body.status).toBe('failed');
  });

  it('hands back a challenge link for the 3DS amount', async () => {
    const intent = await createIntent(NEEDS_3DS);

    const confirmed = await post(`/v1/payment-intents/${intent.id}/confirm`).send({
      methodId: 'pm_card',
    });

    expect(confirmed.body.status).toBe('requires_action');
    expect(confirmed.body.actionUrl).toBe(`http://psp.test/3ds/${intent.id}`);
  });

  it('leaves the stalling amount in processing however long you wait', async () => {
    const intent = await createIntent(NEVER_SETTLES);
    await post(`/v1/payment-intents/${intent.id}/confirm`).send({ methodId: 'pm_card' });

    harness.clock.advance(30 * 60 * 1_000);
    const later = await get(`/v1/payment-intents/${intent.id}`);

    expect(later.body.status).toBe('processing');
  });

  it('refuses to confirm an intent twice', async () => {
    const intent = await createIntent(SUCCEEDS);
    await post(`/v1/payment-intents/${intent.id}/confirm`).send({ methodId: 'pm_card' });

    const again = await post(`/v1/payment-intents/${intent.id}/confirm`).send({
      methodId: 'pm_card',
    });

    expect(again.status).toBe(409);
  });

  it('answers 404 for an intent that does not exist', async () => {
    const response = await get('/v1/payment-intents/pi_nothing');

    expect(response.status).toBe(404);
  });
});

describe('the 3DS challenge', () => {
  it('walks approve through to a settled payment', async () => {
    const intent = await createIntent(NEEDS_3DS);
    await post(`/v1/payment-intents/${intent.id}/confirm`).send({ methodId: 'pm_card' });

    const page = await request(harness.app).get(`/3ds/${intent.id}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain(`/3ds/${intent.id}/complete`);

    await request(harness.app)
      .post(`/3ds/${intent.id}/complete`)
      .type('form')
      .send({ approved: 'yes' });
    harness.clock.advance(SETTLE_DELAY_MS);

    const settled = await get(`/v1/payment-intents/${intent.id}`);
    expect(settled.body.status).toBe('succeeded');
  });

  it('fails the payment when the challenge is rejected', async () => {
    const intent = await createIntent(NEEDS_3DS, 'key_reject');
    await post(`/v1/payment-intents/${intent.id}/confirm`).send({ methodId: 'pm_card' });

    await request(harness.app)
      .post(`/3ds/${intent.id}/complete`)
      .type('form')
      .send({ approved: 'no' });

    const failed = await get(`/v1/payment-intents/${intent.id}`);
    expect(failed.body.status).toBe('failed');
  });

  it('lets a merchant page frame it', async () => {
    const intent = await createIntent(NEEDS_3DS, 'key_frame');
    await post(`/v1/payment-intents/${intent.id}/confirm`).send({ methodId: 'pm_card' });

    const page = await request(harness.app).get(`/3ds/${intent.id}`);

    expect(page.headers['x-frame-options']).toBeUndefined();
    expect(page.headers['content-security-policy']).toContain('frame-ancestors *');
  });
});

describe('webhooks raised by the payment lifecycle', () => {
  it('queues one when a payment settles', async () => {
    const intent = await createIntent(SUCCEEDS);
    await post(`/v1/payment-intents/${intent.id}/confirm`).send({ methodId: 'pm_card' });
    harness.clock.advance(SETTLE_DELAY_MS);
    await get(`/v1/payment-intents/${intent.id}`);

    const queued = await harness.webhooks.forIntent(intent.id);

    expect(queued).toHaveLength(1);
    expect(queued[0]?.event).toBe('payment_intent.succeeded');
    expect(JSON.parse(queued[0]?.payload ?? '{}')).toMatchObject({
      type: 'payment_intent.succeeded',
      data: { object: { id: intent.id, status: 'succeeded' } },
    });
  });

  it('queues one when a payment is declined', async () => {
    const intent = await createIntent(DECLINES);
    await post(`/v1/payment-intents/${intent.id}/confirm`).send({ methodId: 'pm_card' });

    const queued = await harness.webhooks.forIntent(intent.id);

    expect(queued.map((delivery) => delivery.event)).toEqual(['payment_intent.failed']);
  });

  it('raises nothing twice for the same settlement', async () => {
    const intent = await createIntent(SUCCEEDS);
    await post(`/v1/payment-intents/${intent.id}/confirm`).send({ methodId: 'pm_card' });
    harness.clock.advance(SETTLE_DELAY_MS);

    await get(`/v1/payment-intents/${intent.id}`);
    await get(`/v1/payment-intents/${intent.id}`);
    await harness.payments.settleDue();

    expect(await harness.webhooks.forIntent(intent.id)).toHaveLength(1);
  });
});

describe('GET /healthz', () => {
  it('reports the database, not just the process', async () => {
    const response = await request(harness.app).get('/healthz');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', database: 'up' });
  });
});
