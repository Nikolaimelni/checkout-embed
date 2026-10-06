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
import { ApiError, errorHandler, notFoundHandler } from './errors.ts';

export type RateLimitOptions = { readonly windowMs: number; readonly limit: number };

export type AppOptions = {
  readonly database: DatabaseHandle;
  readonly payments: PaymentsService;
  readonly logger: Logger;
  readonly merchantKeys: readonly string[];
  readonly bundleUrl: string;
  readonly bundleIntegrity?: string | undefined;
  readonly publicBaseUrl: string;
  readonly allowedOrigins: readonly string[] | '*';
  readonly rateLimit?: RateLimitOptions | false;
};

export function createApp(options: AppOptions): Express {
  const app = express();

  // one hop; true would let a client spoof X-Forwarded-For past the rate limiter
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // X-Frame-Options cannot be scoped per route, and the 3DS page has to be framed
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

  app.use(
    '/v1',
    cors({
      origin: options.allowedOrigins === '*' ? true : [...options.allowedOrigins],
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['authorization', 'content-type', 'idempotency-key', 'x-request-id'],
      credentials: false,
      maxAge: 600,
    }),
  );

  const limits = options.rateLimit ?? { windowMs: 60_000, limit: 120 };
  if (limits !== false) {
    app.use(
      ['/v1', '/3ds'],
      rateLimit({
        ...limits,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        handler: (_request, _response, next) => {
          next(new ApiError('rate_limited', 'Too many requests. Wait a moment and try again.'));
        },
      }),
    );
  }

  app.use('/v1', express.json({ limit: '32kb' }));
  app.use('/v1/payment-intents', paymentsRouter(options.payments, options.merchantKeys));
  app.use(
    '/v1/config',
    merchantsRouter({
      merchantKeys: options.merchantKeys,
      bundleUrl: options.bundleUrl,
      bundleIntegrity: options.bundleIntegrity,
    }),
  );

  app.use('/3ds', threeDsRouter(options.payments));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
