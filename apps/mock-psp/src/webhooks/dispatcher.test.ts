import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, type DatabaseHandle } from '../db/client.ts';
import { applyMigrations } from '../db/migrate.ts';
import { BASE_DELAY_MS, MAX_ATTEMPTS } from './backoff.ts';
import { createWebhookDispatcher, type Fetcher } from './dispatcher.ts';
import { ABANDONED_AT, createWebhookQueue, type WebhookQueue } from './queue.ts';
import { verifySignature } from './signature.ts';

const SECRET = 'a-secret-long-enough-for-the-schema';
const URL = 'https://merchant.test/hooks';
const NOW = 1_760_000_000_000;

let database: DatabaseHandle;
let queue: WebhookQueue;
const logger = pino({ level: 'silent' });

beforeEach(async () => {
  database = createDatabase(':memory:');
  await applyMigrations(database);
  queue = createWebhookQueue(database.db);
  await queue.enqueue({
    intentId: 'pi_1',
    event: 'payment_intent.succeeded',
    payload: { id: 'evt_1', type: 'payment_intent.succeeded' },
    now: NOW,
  });
});

afterEach(() => {
  database.close();
});

function dispatcherWith(fetcher: Fetcher, now = () => NOW) {
  return createWebhookDispatcher({ queue, secret: SECRET, url: URL, logger, fetcher, now });
}

describe('createWebhookDispatcher', () => {
  it('signs the exact bytes it sends', async () => {
    const seen: { body: string; signature: string }[] = [];
    const fetcher: Fetcher = async (_url, init) => {
      const headers = init.headers as Record<string, string>;
      seen.push({ body: String(init.body), signature: headers['x-checkout-signature'] ?? '' });
      return { ok: true, status: 200 };
    };

    const result = await dispatcherWith(fetcher).tick();

    expect(result).toEqual({ delivered: 1, failed: 0 });
    expect(seen).toHaveLength(1);
    expect(
      verifySignature(seen[0]?.signature ?? '', seen[0]?.body ?? '', SECRET, {
        nowSeconds: Math.floor(NOW / 1_000),
      }),
    ).toBe(true);
  });

  it('does not send a delivery twice', async () => {
    const fetcher = vi.fn<Fetcher>(async () => ({ ok: true, status: 200 }));
    const dispatcher = dispatcherWith(fetcher);

    await dispatcher.tick();
    await dispatcher.tick();

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('backs off after a receiver answers with an error', async () => {
    const fetcher: Fetcher = async () => ({ ok: false, status: 500 });

    const result = await dispatcherWith(fetcher).tick();

    expect(result).toEqual({ delivered: 0, failed: 1 });
    const [delivery] = await queue.forIntent('pi_1');
    expect(delivery).toMatchObject({ attempts: 1, deliveredAt: null });
    expect(delivery?.nextAttemptAt).toBe(NOW + BASE_DELAY_MS);
    expect(delivery?.lastError).toContain('500');
  });

  it('treats a thrown request the same as a rejected one', async () => {
    const fetcher: Fetcher = async () => {
      throw new Error('connect ECONNREFUSED');
    };

    await dispatcherWith(fetcher).tick();

    const [delivery] = await queue.forIntent('pi_1');
    expect(delivery?.lastError).toContain('ECONNREFUSED');
  });

  it('gives up on a receiver that never answers instead of holding the queue', async () => {
    const fetcher: Fetcher = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('receiver timed out')));
      });
    const dispatcher = createWebhookDispatcher({
      queue,
      secret: SECRET,
      url: URL,
      logger,
      fetcher,
      now: () => NOW,
      timeoutMs: 20,
    });

    const result = await dispatcher.tick();

    expect(result).toEqual({ delivered: 0, failed: 1 });
    const [delivery] = await queue.forIntent('pi_1');
    expect(delivery).toMatchObject({ attempts: 1, deliveredAt: null });
  });

  it('leaves a delivery alone until its next attempt is due', async () => {
    const fetcher = vi.fn<Fetcher>(async () => ({ ok: false, status: 500 }));

    await dispatcherWith(fetcher).tick();
    await dispatcherWith(fetcher, () => NOW + BASE_DELAY_MS - 1).tick();

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('gives up rather than retrying a dead endpoint forever', async () => {
    const fetcher: Fetcher = async () => ({ ok: false, status: 500 });
    let at = NOW;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      await dispatcherWith(fetcher, () => at).tick();
      const [delivery] = await queue.forIntent('pi_1');
      at = delivery?.nextAttemptAt ?? at;
    }

    const [delivery] = await queue.forIntent('pi_1');
    expect(delivery).toMatchObject({ attempts: MAX_ATTEMPTS, nextAttemptAt: ABANDONED_AT });
  });

  it('records deliveries and sends nothing when no url is configured', async () => {
    const fetcher = vi.fn<Fetcher>(async () => ({ ok: true, status: 200 }));
    const offline = createWebhookDispatcher({
      queue,
      secret: SECRET,
      url: undefined,
      logger,
      fetcher,
      now: () => NOW,
    });

    await offline.tick();

    expect(fetcher).not.toHaveBeenCalled();
    expect((await queue.forIntent('pi_1'))[0]?.deliveredAt).toBeNull();
  });
});
