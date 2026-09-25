import { Router } from 'express';
import { ApiError } from '../http/errors.ts';
import {
  bearerGuard,
  idempotencyGuard,
  idempotencyKeyOf,
  validate,
  validated,
} from '../http/validate.ts';
import {
  type ConfirmIntentBody,
  ConfirmIntentBodySchema,
  type CreateIntentBody,
  CreateIntentBodySchema,
  type IntentParams,
  IntentParamsSchema,
} from './dto.ts';
import type { PaymentsService } from './service.ts';

export function paymentsRouter(service: PaymentsService, merchantKeys: readonly string[]): Router {
  const router = Router();
  const known = new Set(merchantKeys);

  router.post(
    '/',
    bearerGuard,
    idempotencyGuard,
    validate({ body: CreateIntentBodySchema }),
    async (_request, response) => {
      const { body } = validated<CreateIntentBody>(response);
      // The answer the config route gives, so an unregistered key cannot open intents either.
      if (!known.has(body.merchantKey)) {
        throw new ApiError('not_found', `No merchant is registered under ${body.merchantKey}.`);
      }

      const { intent, replayed } = await service.create(body, idempotencyKeyOf(response));

      // 201 the first time, 200 on a replay.
      response.status(replayed ? 200 : 201).json(intent);
    },
  );

  router.post(
    '/:id/confirm',
    bearerGuard,
    idempotencyGuard,
    validate({ params: IntentParamsSchema, body: ConfirmIntentBodySchema }),
    async (_request, response) => {
      const { params, body } = validated<ConfirmIntentBody, IntentParams>(response);

      response.json(await service.confirm(params.id, body, idempotencyKeyOf(response)));
    },
  );

  router.get(
    '/:id',
    bearerGuard,
    validate({ params: IntentParamsSchema }),
    async (_request, response) => {
      const { params } = validated<unknown, IntentParams>(response);

      response.json(await service.read(params.id));
    },
  );

  return router;
}
