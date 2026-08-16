import { Router } from 'express';
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

export function paymentsRouter(service: PaymentsService): Router {
  const router = Router();

  router.post(
    '/',
    bearerGuard,
    idempotencyGuard,
    validate({ body: CreateIntentBodySchema }),
    async (_request, response) => {
      const { body } = validated<CreateIntentBody>(response);
      const { intent, replayed } = await service.create(body, idempotencyKeyOf(response));

      // 201 the first time, 200 on a replay. A merchant retrying after a dropped connection
      // can tell the two apart without parsing anything.
      response.status(replayed ? 200 : 201).json(intent);
    },
  );

  router.post(
    '/:id/confirm',
    bearerGuard,
    validate({ params: IntentParamsSchema, body: ConfirmIntentBodySchema }),
    async (_request, response) => {
      const { params, body } = validated<ConfirmIntentBody, IntentParams>(response);

      response.json(await service.confirm(params.id, body));
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
