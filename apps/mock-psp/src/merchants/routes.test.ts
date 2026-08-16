import { PROTOCOL_VERSION } from '@checkout-embed/contracts';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness, MERCHANT_KEY } from '../testing/harness.ts';

let harness: Harness;

beforeEach(async () => {
  harness = await createHarness();
});

afterEach(() => {
  harness.close();
});

describe('GET /v1/config/:merchantKey', () => {
  it('tells the loader where the bundle is and which protocol it speaks', async () => {
    const response = await request(harness.app).get(`/v1/config/${MERCHANT_KEY}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      bundleUrl: 'https://cdn.test/checkout.js',
      protocolVersion: PROTOCOL_VERSION,
    });
    expect(response.body.methods.length).toBeGreaterThan(0);
  });

  it('does not need a bearer token, because the loader has none yet', async () => {
    const response = await request(harness.app).get(`/v1/config/${MERCHANT_KEY}`);

    expect(response.status).toBe(200);
  });

  it('answers 404 for a key nobody registered', async () => {
    const response = await request(harness.app).get('/v1/config/mk_test_someone_else');

    expect(response.status).toBe(404);
  });
});
