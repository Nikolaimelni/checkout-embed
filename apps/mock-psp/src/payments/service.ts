import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
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
  create(body: CreateIntentBody, idempotencyKey: string, owner: string): Promise<CreateResult>;
  confirm(
    id: string,
    body: ConfirmIntentBody,
    idempotencyKey: string,
    owner: string,
  ): Promise<PaymentIntent>;
  read(id: string, owner: string): Promise<PaymentIntent>;
  openChallenge(id: string, token: string): Promise<void>;
  completeChallenge(id: string, token: string, approved: boolean): Promise<PaymentIntent>;
  settleDue(): Promise<number>;
};

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

function hashRequest(parts: readonly unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function sameToken(expected: string, received: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createPaymentsService(options: PaymentsServiceOptions): PaymentsService {
  const { repository, webhooks, publicBaseUrl } = options;
  const now = options.now ?? Date.now;

  async function mustOwn(id: string, owner: string): Promise<IntentRow> {
    const row = await repository.byId(id);
    if (!row || row.ownerHash !== owner) {
      throw new ApiError('not_found', `No payment intent with id ${id}.`);
    }
    return row;
  }

  async function openChallengeRow(id: string, token: string): Promise<IntentRow> {
    const row = await repository.byId(id);
    const expected = row?.status === 'requires_action' ? row.challengeToken : null;

    if (!row || expected === null || !sameToken(expected, token)) {
      throw new ApiError('not_found', 'No open challenge at this address.');
    }
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
    async create(body, idempotencyKey, owner) {
      const hash = hashRequest([
        body.merchantKey,
        body.money.amountMinor,
        body.money.currency,
        body.methodId,
      ]);
      const seen = await repository.findKey(body.merchantKey, idempotencyKey);

      if (seen) {
        const earlier = await repository.byId(seen.intentId);
        if (seen.requestHash !== hash || earlier?.ownerHash !== owner) {
          throw new ApiError(
            'idempotency_conflict',
            'This Idempotency-Key was already used with a different request.',
            { idempotencyKey },
          );
        }
        return { intent: toDto(earlier), replayed: true };
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
        ownerHash: owner,
        challengeToken: null,
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

    async confirm(id, body, idempotencyKey, owner) {
      const row = await mustOwn(id, owner);
      const hash = hashRequest(['confirm', id, body.methodId]);
      const seen = await repository.findKey(row.merchantKey, idempotencyKey);

      if (seen) {
        if (seen.requestHash !== hash) {
          throw new ApiError(
            'idempotency_conflict',
            'This Idempotency-Key was already used with a different request.',
            { idempotencyKey },
          );
        }
        return toDto(row);
      }

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
          case 'require_action': {
            const challengeToken = randomBytes(24).toString('base64url');
            return {
              status: 'requires_action',
              methodId: body.methodId,
              actionUrl: `${publicBaseUrl}/3ds/${row.id}?token=${challengeToken}`,
              challengeToken,
              updatedAt: at,
            };
          }
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
      await repository.saveKey({
        merchantKey: row.merchantKey,
        key: idempotencyKey,
        requestHash: hash,
        intentId: id,
        createdAt: at,
      });
      const next = { ...row, ...patch };

      if (next.status === 'failed') await announce(next, 'payment_intent.failed', at);

      return toDto(next);
    },

    async read(id, owner) {
      const row = await mustOwn(id, owner);
      const at = now();

      return toDto(isDue(row, at) ? await settle(row, at) : row);
    },

    async openChallenge(id, token) {
      await openChallengeRow(id, token);
    },

    async completeChallenge(id, token, approved) {
      const row = await openChallengeRow(id, token);

      const at = now();
      const closed = { actionUrl: null, challengeToken: null, updatedAt: at } as const;
      const patch: Partial<IntentRow> = approved
        ? { ...closed, status: 'processing', settleAt: at + SETTLE_DELAY_MS }
        : { ...closed, status: 'failed', settleAt: null };

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
