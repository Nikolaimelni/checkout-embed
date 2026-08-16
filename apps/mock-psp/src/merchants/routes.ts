import { PROTOCOL_VERSION, RemoteWidgetConfigSchema } from '@checkout-embed/contracts';
import { Router } from 'express';
import { ApiError } from '../http/errors.ts';
import { validate, validated } from '../http/validate.ts';
import { type MerchantParams, MerchantParamsSchema } from '../payments/dto.ts';
import { SUPPORTED_METHODS } from './methods.ts';

export type MerchantConfigOptions = {
  readonly merchantKeys: readonly string[];
  readonly bundleUrl: string;
};

export function merchantsRouter(options: MerchantConfigOptions): Router {
  const router = Router();
  const known = new Set(options.merchantKeys);

  router.get('/:merchantKey', validate({ params: MerchantParamsSchema }), (_request, response) => {
    const { params } = validated<unknown, MerchantParams>(response);

    if (!known.has(params.merchantKey)) {
      throw new ApiError('not_found', `No merchant is registered under ${params.merchantKey}.`);
    }

    response.json(
      RemoteWidgetConfigSchema.parse({
        bundleUrl: options.bundleUrl,
        protocolVersion: PROTOCOL_VERSION,
        methods: SUPPORTED_METHODS,
      }),
    );
  });

  return router;
}
