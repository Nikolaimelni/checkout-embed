import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { type Logger, pino } from 'pino';

export type RequestContext = {
  readonly requestId: string;
  readonly log: Logger;
};

const storage = new AsyncLocalStorage<RequestContext>();

const REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

export function createRootLogger(level: string): Logger {
  return pino({ level, base: { service: 'mock-psp' } });
}

export function log(): Logger {
  const context = storage.getStore();
  if (context) return context.log;
  throw new Error('log() was called outside a request. Use the root logger instead.');
}

export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

export function requestContext(root: Logger) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const inbound = request.get('x-request-id');
    const requestId = inbound && REQUEST_ID.test(inbound) ? inbound : randomUUID();
    const child = root.child({ requestId });
    const startedAt = process.hrtime.bigint();

    response.setHeader('x-request-id', requestId);

    response.on('finish', () => {
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      child.info(
        {
          method: request.method,
          path: request.route?.path ?? request.path,
          status: response.statusCode,
          elapsedMs: Math.round(elapsedMs * 100) / 100,
        },
        'request finished',
      );
    });

    storage.run({ requestId, log: child }, next);
  };
}
