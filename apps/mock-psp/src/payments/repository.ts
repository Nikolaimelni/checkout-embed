import { and, eq, lte } from 'drizzle-orm';
import type { Database } from '../db/client.ts';
import { idempotencyKeys, paymentIntents } from '../db/schema.ts';

export type IntentRow = typeof paymentIntents.$inferSelect;
export type NewIntentRow = typeof paymentIntents.$inferInsert;
export type IdempotencyRow = typeof idempotencyKeys.$inferSelect;

export type IntentRepository = {
  insert(row: NewIntentRow): Promise<void>;
  byId(id: string): Promise<IntentRow | undefined>;
  patch(id: string, values: Partial<NewIntentRow>): Promise<void>;
  dueForSettlement(now: number): Promise<IntentRow[]>;
  findKey(merchantKey: string, key: string): Promise<IdempotencyRow | undefined>;
  saveKey(row: IdempotencyRow): Promise<void>;
};

export function createIntentRepository(db: Database): IntentRepository {
  return {
    async insert(row) {
      await db.insert(paymentIntents).values(row);
    },

    async byId(id) {
      const [row] = await db
        .select()
        .from(paymentIntents)
        .where(eq(paymentIntents.id, id))
        .limit(1);
      return row;
    },

    async patch(id, values) {
      await db.update(paymentIntents).set(values).where(eq(paymentIntents.id, id));
    },

    async dueForSettlement(now) {
      return db
        .select()
        .from(paymentIntents)
        .where(and(eq(paymentIntents.status, 'processing'), lte(paymentIntents.settleAt, now)));
    },

    async findKey(merchantKey, key) {
      const [row] = await db
        .select()
        .from(idempotencyKeys)
        .where(and(eq(idempotencyKeys.merchantKey, merchantKey), eq(idempotencyKeys.key, key)))
        .limit(1);
      return row;
    },

    async saveKey(row) {
      await db.insert(idempotencyKeys).values(row);
    },
  };
}
