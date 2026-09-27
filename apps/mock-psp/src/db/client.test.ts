import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseHandle } from './client.ts';
import { applyMigrations } from './migrate.ts';
import { paymentIntents } from './schema.ts';

describe('the node:sqlite proxy driver', () => {
  let handle: DatabaseHandle;

  beforeEach(async () => {
    handle = createDatabase(':memory:');
    await applyMigrations(handle);
  });

  afterEach(() => {
    handle.close();
  });

  const row = {
    id: 'pi_1',
    merchantKey: 'mk_test_acme',
    amountMinor: 1000,
    currency: 'EUR',
    methodId: null,
    status: 'requires_confirmation',
    actionUrl: null,
    settleAt: null,
    outcome: 'succeed',
    ownerHash: 'owner',
    challengeToken: null,
    createdAt: 1_760_000_000_000,
    updatedAt: 1_760_000_000_000,
  };

  it('round trips a row through insert and select', async () => {
    await handle.db.insert(paymentIntents).values(row);

    const found = await handle.db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.id, 'pi_1'));

    expect(found).toEqual([row]);
  });

  it('returns nothing rather than a row of undefined when a get misses', async () => {
    const found = await handle.db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.id, 'pi_missing'))
      .limit(1);

    expect(found).toEqual([]);
  });

  it('keeps large millisecond timestamps intact', async () => {
    await handle.db
      .insert(paymentIntents)
      .values({ ...row, id: 'pi_2', createdAt: 1_893_456_000_123 });

    const [found] = await handle.db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.id, 'pi_2'));

    expect(found?.createdAt).toBe(1_893_456_000_123);
  });

  it('answers a ping, which is what the health route leans on', () => {
    expect(handle.ping()).toBe(true);
  });
});
