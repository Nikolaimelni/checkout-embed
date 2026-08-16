import { randomUUID } from 'node:crypto';
import { and, asc, eq, isNull, lte } from 'drizzle-orm';
import type { Database } from '../db/client.ts';
import { webhookDeliveries } from '../db/schema.ts';

export const WEBHOOK_EVENTS = ['payment_intent.succeeded', 'payment_intent.failed'] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export type DeliveryRow = typeof webhookDeliveries.$inferSelect;

/** Parked rather than deleted, so an abandoned delivery is still there to look at. */
export const ABANDONED_AT = 8_640_000_000_000_000;

export type EnqueueInput = {
  readonly intentId: string;
  readonly event: WebhookEvent;
  readonly payload: unknown;
  readonly now: number;
};

export type WebhookQueue = {
  enqueue(input: EnqueueInput): Promise<void>;
  due(now: number, limit?: number): Promise<DeliveryRow[]>;
  markDelivered(id: string, now: number): Promise<void>;
  reschedule(id: string, attempts: number, error: string, nextAttemptAt: number): Promise<void>;
  abandon(id: string, attempts: number, error: string): Promise<void>;
  forIntent(intentId: string): Promise<DeliveryRow[]>;
};

export function createWebhookQueue(db: Database): WebhookQueue {
  const setOn = (id: string, values: Partial<DeliveryRow>) =>
    db.update(webhookDeliveries).set(values).where(eq(webhookDeliveries.id, id));

  return {
    async enqueue({ intentId, event, payload, now }) {
      await db.insert(webhookDeliveries).values({
        id: `whd_${randomUUID()}`,
        intentId,
        event,
        // Serialised once, at enqueue time. The signature covers these exact bytes, so
        // re-encoding on the way out would invalidate it.
        payload: JSON.stringify(payload),
        attempts: 0,
        nextAttemptAt: now,
        deliveredAt: null,
        lastError: null,
        createdAt: now,
      });
    },

    async due(now, limit = 20) {
      return db
        .select()
        .from(webhookDeliveries)
        .where(
          and(isNull(webhookDeliveries.deliveredAt), lte(webhookDeliveries.nextAttemptAt, now)),
        )
        .orderBy(asc(webhookDeliveries.nextAttemptAt))
        .limit(limit);
    },

    async markDelivered(id, now) {
      await setOn(id, { deliveredAt: now, lastError: null });
    },

    async reschedule(id, attempts, error, nextAttemptAt) {
      await setOn(id, { attempts, lastError: error.slice(0, 500), nextAttemptAt });
    },

    async abandon(id, attempts, error) {
      await setOn(id, { attempts, lastError: error.slice(0, 500), nextAttemptAt: ABANDONED_AT });
    },

    async forIntent(intentId) {
      return db
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.intentId, intentId))
        .orderBy(asc(webhookDeliveries.createdAt));
    },
  };
}
