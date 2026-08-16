import type { Express } from 'express';
import { pino } from 'pino';
import { createDatabase, type DatabaseHandle } from '../db/client.ts';
import { applyMigrations } from '../db/migrate.ts';
import { createApp } from '../http/app.ts';
import { createIntentRepository } from '../payments/repository.ts';
import { createPaymentsService, type PaymentsService } from '../payments/service.ts';
import { createWebhookQueue, type WebhookQueue } from '../webhooks/queue.ts';

export const MERCHANT_KEY = 'mk_test_acme';
export const BEARER = 'Bearer test-token';
export const PUBLIC_BASE_URL = 'http://psp.test';

/** A clock the tests move by hand, so settlement is a fact rather than a wait. */
export type Clock = {
  now(): number;
  advance(ms: number): void;
};

export type Harness = {
  readonly app: Express;
  readonly clock: Clock;
  readonly payments: PaymentsService;
  readonly webhooks: WebhookQueue;
  readonly database: DatabaseHandle;
  close(): void;
};

export async function createHarness(startAt = 1_760_000_000_000): Promise<Harness> {
  const database = createDatabase(':memory:');
  await applyMigrations(database);

  let current = startAt;
  const clock: Clock = {
    now: () => current,
    advance: (ms) => {
      current += ms;
    },
  };

  const webhooks = createWebhookQueue(database.db);
  const payments = createPaymentsService({
    repository: createIntentRepository(database.db),
    webhooks,
    publicBaseUrl: PUBLIC_BASE_URL,
    now: clock.now,
  });

  const app = createApp({
    database,
    payments,
    logger: pino({ level: 'silent' }),
    merchantKeys: [MERCHANT_KEY],
    bundleUrl: 'https://cdn.test/checkout.js',
    publicBaseUrl: PUBLIC_BASE_URL,
    rateLimit: false,
  });

  return { app, clock, payments, webhooks, database, close: () => database.close() };
}

export function intentBody(amountMinor: number): Record<string, unknown> {
  return { merchantKey: MERCHANT_KEY, money: { amountMinor, currency: 'EUR' } };
}
