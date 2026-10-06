import { PROTOCOL_VERSION } from '@checkout-embed/contracts';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness, MERCHANT_KEY } from '../testing/harness.ts';
import { merchantsRouter } from './routes.ts';

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

  it('does not need a bearer token', async () => {
    const response = await request(harness.app).get(`/v1/config/${MERCHANT_KEY}`);

    expect(response.status).toBe(200);
  });

  it('answers 404 for a key nobody registered', async () => {
    const response = await request(harness.app).get('/v1/config/mk_test_someone_else');

    expect(response.status).toBe(404);
  });

  it('pins the bundle when an integrity value is configured', async () => {
    const integrity = 'sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC';
    const app = express().use(
      '/v1/config',
      merchantsRouter({
        merchantKeys: [MERCHANT_KEY],
        bundleUrl: 'https://cdn.test/checkout.js',
        bundleIntegrity: integrity,
      }),
    );

    const response = await request(app).get(`/v1/config/${MERCHANT_KEY}`);

    expect(response.body.integrity).toBe(integrity);
  });
});
