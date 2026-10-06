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

const confirm = (id: string, key = `confirm_${id}`, methodId = 'pm_card') =>
  post(`/v1/payment-intents/${id}/confirm`).set('idempotency-key', key).send({ methodId });

async function challengeFor(id: string): Promise<{ path: string; token: string }> {
  const confirmed = await confirm(id);
  const url = new URL(confirmed.body.actionUrl as string);
  return { path: `${url.pathname}${url.search}`, token: url.searchParams.get('token') ?? '' };
}

const complete = (id: string, token: string, approved: 'yes' | 'no') =>
  request(harness.app).post(`/3ds/${id}/complete`).type('form').send({ token, approved });

describe('POST /v1/payment-intents', () => {
  it('refuses a request without a bearer token', async () => {
    const response = await request(harness.app)
      .post('/v1/payment-intents')
      .set('idempotency-key', 'key_1')
      .send(intentBody(SUCCEEDS));

    expect(response.status).toBe(401);
  });

  it('refuses a request without an idempotency key', async () => {
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

  it('refuses an intent for a merchant nobody registered', async () => {
    const response = await post('/v1/payment-intents')
      .set('idempotency-key', 'key_stranger')
      .send({ ...intentBody(SUCCEEDS), merchantKey: 'mk_test_someone_else' });

    expect(response.status).toBe(404);
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

    const confirmed = await confirm(intent.id);
    expect(confirmed.body.status).toBe('processing');

    const early = await get(`/v1/payment-intents/${intent.id}`);
    expect(early.body.status).toBe('processing');

    harness.clock.advance(SETTLE_DELAY_MS);
    const settled = await get(`/v1/payment-intents/${intent.id}`);
    expect(settled.body.status).toBe('succeeded');
  });

  it('fails the declining amount straight away', async () => {
    const intent = await createIntent(DECLINES);

    const confirmed = await confirm(intent.id);

    expect(confirmed.body.status).toBe('failed');
  });

  it('hands back a challenge link for the 3DS amount', async () => {
    const intent = await createIntent(NEEDS_3DS);

    const confirmed = await confirm(intent.id);

    expect(confirmed.body.status).toBe('requires_action');
    const url = new URL(confirmed.body.actionUrl);
    expect(url.origin + url.pathname).toBe(`https://psp.test/3ds/${intent.id}`);
    expect(url.searchParams.get('token')).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it('leaves the stalling amount in processing however long you wait', async () => {
    const intent = await createIntent(NEVER_SETTLES);
    await confirm(intent.id);

    harness.clock.advance(30 * 60 * 1_000);
    const later = await get(`/v1/payment-intents/${intent.id}`);

    expect(later.body.status).toBe('processing');
  });

  it('refuses to confirm an intent twice under two keys', async () => {
    const intent = await createIntent(SUCCEEDS);
    await confirm(intent.id, 'confirm_first');

    const again = await confirm(intent.id, 'confirm_second');

    expect(again.status).toBe(409);
  });

  it('replays a confirm that comes back under the same key', async () => {
    const intent = await createIntent(SUCCEEDS);
    const first = await confirm(intent.id, 'confirm_lost');

    const again = await confirm(intent.id, 'confirm_lost');

    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
  });

  it('answers 409 when a confirm key comes back with another method', async () => {
    const intent = await createIntent(SUCCEEDS);
    await confirm(intent.id, 'confirm_switched');

    const again = await confirm(intent.id, 'confirm_switched', 'pm_apple_pay');

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('idempotency_conflict');
  });

  it('refuses a confirm without an idempotency key', async () => {
    const intent = await createIntent(SUCCEEDS);

    const response = await post(`/v1/payment-intents/${intent.id}/confirm`).send({
      methodId: 'pm_card',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('Idempotency-Key');
  });

  it('answers 404 for an intent that does not exist', async () => {
    const response = await get('/v1/payment-intents/pi_nothing');

    expect(response.status).toBe(404);
  });
});

describe('another caller', () => {
  const stranger = 'Bearer someone-else';

  it('cannot read an intent it did not create', async () => {
    const intent = await createIntent(SUCCEEDS);

    const response = await request(harness.app)
      .get(`/v1/payment-intents/${intent.id}`)
      .set('authorization', stranger);

    expect(response.status).toBe(404);
  });

  it('cannot confirm one either', async () => {
    const intent = await createIntent(SUCCEEDS);

    const response = await request(harness.app)
      .post(`/v1/payment-intents/${intent.id}/confirm`)
      .set('authorization', stranger)
      .set('idempotency-key', 'confirm_stranger')
      .send({ methodId: 'pm_card' });

    expect(response.status).toBe(404);
    const unchanged = await get(`/v1/payment-intents/${intent.id}`);
    expect(unchanged.body.status).toBe('requires_confirmation');
  });

  it('cannot fish an intent out by replaying its idempotency key', async () => {
    await createIntent(SUCCEEDS, 'key_shared');

    const response = await request(harness.app)
      .post('/v1/payment-intents')
      .set('authorization', stranger)
      .set('idempotency-key', 'key_shared')
      .send(intentBody(SUCCEEDS));

    expect(response.status).toBe(409);
    expect(JSON.stringify(response.body)).not.toContain('pi_');
  });
});

describe('the 3DS challenge', () => {
  it('walks approve through to a settled payment', async () => {
    const intent = await createIntent(NEEDS_3DS);
    const { path, token } = await challengeFor(intent.id);

    const page = await request(harness.app).get(path);
    expect(page.status).toBe(200);
    expect(page.text).toContain(`/3ds/${intent.id}/complete`);
    expect(page.text).toContain(`value="${token}"`);

    expect((await complete(intent.id, token, 'yes')).status).toBe(200);
    harness.clock.advance(SETTLE_DELAY_MS);

    const settled = await get(`/v1/payment-intents/${intent.id}`);
    expect(settled.body.status).toBe('succeeded');
  });

  it('fails the payment when the challenge is rejected', async () => {
    const intent = await createIntent(NEEDS_3DS, 'key_reject');
    const { token } = await challengeFor(intent.id);

    await complete(intent.id, token, 'no');

    const failed = await get(`/v1/payment-intents/${intent.id}`);
    expect(failed.body.status).toBe('failed');
  });

  it('lets a merchant page frame it', async () => {
    const intent = await createIntent(NEEDS_3DS, 'key_frame');
    const { path } = await challengeFor(intent.id);

    const page = await request(harness.app).get(path);

    expect(page.headers['x-frame-options']).toBeUndefined();
    expect(page.headers['content-security-policy']).toContain('frame-ancestors *');
  });

  it('serves no page without the token from the link', async () => {
    const intent = await createIntent(NEEDS_3DS, 'key_no_token');
    await challengeFor(intent.id);

    const bare = await request(harness.app).get(`/3ds/${intent.id}`);
    const forged = await request(harness.app).get(`/3ds/${intent.id}?token=${'a'.repeat(32)}`);

    expect(bare.status).toBe(400);
    expect(forged.status).toBe(404);
  });

  it('lets nobody approve a challenge with a guessed token', async () => {
    const intent = await createIntent(NEEDS_3DS, 'key_guess');
    await challengeFor(intent.id);

    const response = await complete(intent.id, 'a'.repeat(32), 'yes');

    expect(response.status).toBe(404);
    expect((await get(`/v1/payment-intents/${intent.id}`)).body.status).toBe('requires_action');
  });

  it('takes the token once', async () => {
    const intent = await createIntent(NEEDS_3DS, 'key_twice');
    const { token } = await challengeFor(intent.id);
    await complete(intent.id, token, 'no');

    const again = await complete(intent.id, token, 'yes');

    expect(again.status).toBe(404);
    expect((await get(`/v1/payment-intents/${intent.id}`)).body.status).toBe('failed');
  });

  it('refuses an answer that is neither yes nor no', async () => {
    const intent = await createIntent(NEEDS_3DS, 'key_maybe');
    const { token } = await challengeFor(intent.id);

    const response = await request(harness.app)
      .post(`/3ds/${intent.id}/complete`)
      .type('form')
      .send({ token, approved: 'maybe' });

    expect(response.status).toBe(400);
  });
});

describe('webhooks raised by the payment lifecycle', () => {
  it('queues one when a payment settles', async () => {
    const intent = await createIntent(SUCCEEDS);
    await confirm(intent.id);
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
    await confirm(intent.id);

    const queued = await harness.webhooks.forIntent(intent.id);

    expect(queued.map((delivery) => delivery.event)).toEqual(['payment_intent.failed']);
  });

  it('raises nothing twice for the same settlement', async () => {
    const intent = await createIntent(SUCCEEDS);
    await confirm(intent.id);
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

describe('cross origin access', () => {
  it('answers the preflight an embedded checkout always triggers', async () => {
    const response = await request(harness.app)
      .options('/v1/payment-intents')
      .set('origin', 'https://shop.example')
      .set('access-control-request-method', 'POST')
      .set('access-control-request-headers', 'authorization,idempotency-key');

    expect(response.status).toBeLessThan(300);
    expect(response.headers['access-control-allow-origin']).toBeDefined();
    expect(response.headers['access-control-allow-headers']?.toLowerCase()).toContain(
      'idempotency-key',
    );
  });

  it('lets the answer itself be read from another origin', async () => {
    const response = await request(harness.app)
      .get(`/v1/config/${MERCHANT_KEY}`)
      .set('origin', 'https://shop.example');

    expect(response.headers['access-control-allow-origin']).toBeDefined();
  });
});

describe('request ids', () => {
  it('echoes a plain id the caller sent', async () => {
    const response = await request(harness.app).get('/healthz').set('x-request-id', 'req_42.a-b');

    expect(response.headers['x-request-id']).toBe('req_42.a-b');
  });

  it('replaces one it would not want in a log line', async () => {
    const response = await request(harness.app)
      .get('/healthz')
      .set('x-request-id', '<script>alert(1)</script>');

    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('requests that never reach a handler', () => {
  it('answers malformed json with 400', async () => {
    const response = await post('/v1/payment-intents')
      .set('idempotency-key', 'key_json')
      .set('content-type', 'application/json')
      .send('{"merchantKey": ');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('bad_request');
  });

  it('answers a body over the limit with 413', async () => {
    const response = await post('/v1/payment-intents')
      .set('idempotency-key', 'key_big')
      .send({ ...intentBody(SUCCEEDS), padding: 'x'.repeat(40_000) });

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('payload_too_large');
  });

  it('answers the rate limit in the same shape as every other error', async () => {
    const limited = await createHarness(undefined, { windowMs: 60_000, limit: 1 });

    try {
      await request(limited.app).get(`/v1/config/${MERCHANT_KEY}`);
      const response = await request(limited.app).get(`/v1/config/${MERCHANT_KEY}`);

      expect(response.status).toBe(429);
      expect(response.body.error.code).toBe('rate_limited');
    } finally {
      limited.close();
    }
  });
});

describe('content security policy', () => {
  it('keeps the strict policy on the api', async () => {
    const response = await request(harness.app).get(`/v1/config/${MERCHANT_KEY}`);

    expect(response.headers['content-security-policy']).not.toContain('unsafe-inline');
  });

  it('allows inline styles on the docs page and nowhere else', async () => {
    const response = await request(harness.app).get('/docs');

    expect(response.headers['content-security-policy']).toContain(
      "style-src 'self' 'unsafe-inline'",
    );
  });
});
