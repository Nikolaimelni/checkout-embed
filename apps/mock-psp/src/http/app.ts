import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import type { Logger } from 'pino';
import type { DatabaseHandle } from '../db/client.ts';
import { merchantsRouter } from '../merchants/routes.ts';
import { requestContext } from '../observability/context.ts';
import { docsRouter } from '../openapi/routes.ts';
import { paymentsRouter } from '../payments/routes.ts';
import type { PaymentsService } from '../payments/service.ts';
import { threeDsRouter } from '../threeds/routes.ts';
import { errorHandler, notFoundHandler } from './errors.ts';

export type RateLimitOptions = { readonly windowMs: number; readonly limit: number };

export type AppOptions = {
  readonly database: DatabaseHandle;
  readonly payments: PaymentsService;
  readonly logger: Logger;
  readonly merchantKeys: readonly string[];
  readonly bundleUrl: string;
  readonly publicBaseUrl: string;
  /** Origins allowed to call /v1, or '*' for anyone. */
  readonly allowedOrigins: readonly string[] | '*';
  /** False in tests, where a shared counter across cases is just a source of flakiness. */
  readonly rateLimit?: RateLimitOptions | false;
};

export function createApp(options: AppOptions): Express {
  const app = express();

  // One hop, because this runs behind a single load balancer. Left at true the rate
  // limiter would trust a client supplied X-Forwarded-For and count everyone as one caller.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // X-Frame-Options is the blunt version of frame-ancestors and there is no way to
      // scope it per route without removing it, which the 3DS router does anyway.
      frameguard: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );

  app.use(requestContext(options.logger));

  app.use(docsRouter(options.publicBaseUrl));

  app.get('/healthz', (_request, response) => {
    try {
      options.database.ping();
      response.json({ status: 'ok', database: 'up' });
    } catch (cause) {
      options.logger.error({ err: cause }, 'health check could not reach the database');
      response
        .status(503)
        .json({ error: { code: 'internal', message: 'The database did not answer.' } });
    }
  });

  // An embedded checkout runs on the merchant's origin and calls this one, so every /v1
  // request is cross origin and every one of them is preflighted: the SDK sends both
  // Authorization and Idempotency-Key, neither of which is a simple header.
  app.use(
    '/v1',
    cors({
      origin: options.allowedOrigins === '*' ? true : [...options.allowedOrigins],
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['authorization', 'content-type', 'idempotency-key', 'x-request-id'],
      // Bearer tokens, not cookies. Allowing credentials would rule out the '*' origin
      // and buy nothing.
      credentials: false,
      maxAge: 600,
    }),
  );

  const limits = options.rateLimit ?? { windowMs: 60_000, limit: 120 };
  if (limits !== false) {
    app.use('/v1', rateLimit({ ...limits, standardHeaders: 'draft-7', legacyHeaders: false }));
  }

  app.use('/v1', express.json({ limit: '32kb' }));
  app.use('/v1/payment-intents', paymentsRouter(options.payments));
  app.use(
    '/v1/config',
    merchantsRouter({ merchantKeys: options.merchantKeys, bundleUrl: options.bundleUrl }),
  );

  app.use('/3ds', threeDsRouter(options.payments));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
