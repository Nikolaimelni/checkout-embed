import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Timestamps are epoch milliseconds. SQLite has no date type. */
export const paymentIntents = sqliteTable('payment_intents', {
  id: text('id').primaryKey(),
  merchantKey: text('merchant_key').notNull(),
  amountMinor: integer('amount_minor').notNull(),
  currency: text('currency').notNull(),
  methodId: text('method_id'),
  status: text('status').notNull(),
  actionUrl: text('action_url'),
  /** When a processing intent is allowed to settle. Null while nothing is pending. */
  settleAt: integer('settle_at'),
  /** The outcome the trigger amount picked, decided once at creation. */
  outcome: text('outcome').notNull(),
  /** sha256 of the bearer token that created it. Rows from before the column match no one. */
  ownerHash: text('owner_hash'),
  /** The secret in the 3DS link, set while a challenge is open and cleared once it is used. */
  challengeToken: text('challenge_token'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/** Scoped per merchant, the way real providers scope them per account. */
export const idempotencyKeys = sqliteTable(
  'idempotency_keys',
  {
    merchantKey: text('merchant_key').notNull(),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    intentId: text('intent_id').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.merchantKey, table.key] })],
);

export const webhookDeliveries = sqliteTable(
  'webhook_deliveries',
  {
    id: text('id').primaryKey(),
    intentId: text('intent_id').notNull(),
    event: text('event').notNull(),
    payload: text('payload').notNull(),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: integer('next_attempt_at').notNull(),
    deliveredAt: integer('delivered_at'),
    lastError: text('last_error'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('webhook_deliveries_next_attempt_at').on(table.nextAttemptAt)],
);
