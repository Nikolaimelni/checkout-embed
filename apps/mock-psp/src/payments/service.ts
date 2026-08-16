import { createHash, randomUUID } from 'node:crypto';
import { type PaymentIntent, PaymentIntentSchema } from '@checkout-embed/contracts';
import { ApiError } from '../http/errors.ts';
import type { WebhookEvent, WebhookQueue } from '../webhooks/queue.ts';
import type { ConfirmIntentBody, CreateIntentBody } from './dto.ts';
import type { IntentRepository, IntentRow } from './repository.ts';
import { NEVER_SETTLES_MS, outcomeFor, SETTLE_DELAY_MS } from './triggers.ts';

export type PaymentsServiceOptions = {
  readonly repository: IntentRepository;
  readonly webhooks: WebhookQueue;
  readonly publicBaseUrl: string;
  readonly now?: () => number;
};

export type CreateResult = { readonly intent: PaymentIntent; readonly replayed: boolean };

export type PaymentsService = {
  create(body: CreateIntentBody, idempotencyKey: string): Promise<CreateResult>;
  confirm(id: string, body: ConfirmIntentBody): Promise<PaymentIntent>;
  read(id: string): Promise<PaymentIntent>;
  completeChallenge(id: string, approved: boolean): Promise<PaymentIntent>;
  settleDue(): Promise<number>;
};

/**
 * Everything the HTTP layer hands back goes through the published schema on the way out,
 * so a column added to the table cannot leak into the API by accident.
 */
function toDto(row: IntentRow): PaymentIntent {
  return PaymentIntentSchema.parse({
    id: row.id,
    status: row.status,
    money: { amountMinor: row.amountMinor, currency: row.currency },
    methodId: row.methodId,
    createdAt: new Date(row.createdAt).toISOString(),
    actionUrl: row.actionUrl,
  });
}

/**
 * An array of primitives in a fixed order rather than JSON.stringify over the object.
 * Key order in an object literal is stable in practice and not something an idempotency
 * check should be resting on.
 */
function hashRequest(body: CreateIntentBody): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        body.merchantKey,
        body.money.amountMinor,
        body.money.currency,
        body.methodId,
      ]),
    )
    .digest('hex');
}

export function createPaymentsService(options: PaymentsServiceOptions): PaymentsService {
  const { repository, webhooks, publicBaseUrl } = options;
  const now = options.now ?? Date.now;

  async function mustFind(id: string): Promise<IntentRow> {
    const row = await repository.byId(id);
    if (!row) throw new ApiError('not_found', `No payment intent with id ${id}.`);
    return row;
  }

  async function announce(row: IntentRow, event: WebhookEvent, at: number): Promise<void> {
    await webhooks.enqueue({
      intentId: row.id,
      event,
      now: at,
      payload: {
        id: `evt_${randomUUID()}`,
        type: event,
        createdAt: new Date(at).toISOString(),
        data: { object: toDto(row) },
      },
    });
  }

  async function settle(row: IntentRow, at: number): Promise<IntentRow> {
    const patch = { status: 'succeeded', settleAt: null, actionUrl: null, updatedAt: at } as const;
    await repository.patch(row.id, patch);
    const settled = { ...row, ...patch };
    await announce(settled, 'payment_intent.succeeded', at);
    return settled;
  }

  function isDue(row: IntentRow, at: number): boolean {
    return row.status === 'processing' && row.settleAt !== null && row.settleAt <= at;
  }

  return {
    async create(body, idempotencyKey) {
      const hash = hashRequest(body);
      const seen = await repository.findKey(body.merchantKey, idempotencyKey);

      if (seen) {
        if (seen.requestHash !== hash) {
          throw new ApiError(
            'idempotency_conflict',
            'This Idempotency-Key was already used with a different request body.',
            { idempotencyKey },
          );
        }
        return { intent: toDto(await mustFind(seen.intentId)), replayed: true };
      }

      const at = now();
      const row: IntentRow = {
        id: `pi_${randomUUID()}`,
        merchantKey: body.merchantKey,
        amountMinor: body.money.amountMinor,
        currency: body.money.currency,
        methodId: body.methodId,
        status: 'requires_confirmation',
        actionUrl: null,
        settleAt: null,
        outcome: outcomeFor(body.money.amountMinor),
        createdAt: at,
        updatedAt: at,
      };

      await repository.insert(row);
      await repository.saveKey({
        merchantKey: body.merchantKey,
        key: idempotencyKey,
        requestHash: hash,
        intentId: row.id,
        createdAt: at,
      });

      return { intent: toDto(row), replayed: false };
    },

    async confirm(id, body) {
      const row = await mustFind(id);

      if (row.status !== 'requires_confirmation') {
        throw new ApiError(
          'conflict',
          `A payment intent can only be confirmed while it is requires_confirmation, and this one is ${row.status}.`,
        );
      }

      const at = now();
      const patch = ((): Partial<IntentRow> => {
        switch (row.outcome) {
          case 'decline':
            return { status: 'failed', methodId: body.methodId, updatedAt: at };
          case 'require_action':
            return {
              status: 'requires_action',
              methodId: body.methodId,
              actionUrl: `${publicBaseUrl}/3ds/${row.id}`,
              updatedAt: at,
            };
          case 'stall':
            return {
              status: 'processing',
              methodId: body.methodId,
              settleAt: at + NEVER_SETTLES_MS,
              updatedAt: at,
            };
          default:
            return {
              status: 'processing',
              methodId: body.methodId,
              settleAt: at + SETTLE_DELAY_MS,
              updatedAt: at,
            };
        }
      })();

      await repository.patch(id, patch);
      const next = { ...row, ...patch };

      if (next.status === 'failed') await announce(next, 'payment_intent.failed', at);

      return toDto(next);
    },

    async read(id) {
      const row = await mustFind(id);
      const at = now();

      return toDto(isDue(row, at) ? await settle(row, at) : row);
    },

    async completeChallenge(id, approved) {
      const row = await mustFind(id);

      if (row.status !== 'requires_action') {
        throw new ApiError(
          'conflict',
          `There is no open challenge on this payment intent, it is ${row.status}.`,
        );
      }

      const at = now();
      const patch: Partial<IntentRow> = approved
        ? { status: 'processing', actionUrl: null, settleAt: at + SETTLE_DELAY_MS, updatedAt: at }
        : { status: 'failed', actionUrl: null, settleAt: null, updatedAt: at };

      await repository.patch(id, patch);
      const next = { ...row, ...patch };

      if (!approved) await announce(next, 'payment_intent.failed', at);

      return toDto(next);
    },

    async settleDue() {
      const at = now();
      const due = await repository.dueForSettlement(at);

      for (const row of due) await settle(row, at);

      return due.length;
    },
  };
}
