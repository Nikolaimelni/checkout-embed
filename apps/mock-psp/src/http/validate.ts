import { createHash } from 'node:crypto';
import { describeIssues } from '@checkout-embed/contracts';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { z } from 'zod';
import { ApiError } from './errors.ts';

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, where: string): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;

  throw new ApiError('bad_request', `The ${where} did not validate.`, {
    issues: describeIssues(parsed.error),
  });
}

export type Validated<TBody = unknown, TParams = unknown, TQuery = unknown> = {
  body: TBody;
  params: TParams;
  query: TQuery;
};

export function validated<TBody = unknown, TParams = unknown, TQuery = unknown>(
  response: Response,
): Validated<TBody, TParams, TQuery> {
  const value = response.locals['validated'] as Validated<TBody, TParams, TQuery> | undefined;
  if (!value) throw new Error('validate() did not run for this route.');
  return value;
}

export type ValidationSchemas = {
  readonly body?: z.ZodType<unknown>;
  readonly params?: z.ZodType<unknown>;
  readonly query?: z.ZodType<unknown>;
};

export function validate(schemas: ValidationSchemas): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    response.locals['validated'] = {
      body: schemas.body ? parseOrThrow(schemas.body, request.body, 'request body') : undefined,
      params: schemas.params
        ? parseOrThrow(schemas.params, request.params, 'path parameters')
        : undefined,
      query: schemas.query ? parseOrThrow(schemas.query, request.query, 'query string') : undefined,
    } satisfies Validated;

    next();
  };
}

export function requireBearer(request: Request): string {
  const header = request.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';

  if (token.length === 0) {
    throw new ApiError('unauthorized', 'Send an Authorization: Bearer <token> header.');
  }

  return token;
}

export const bearerGuard: RequestHandler = (request, response, next) => {
  response.locals['owner'] = createHash('sha256').update(requireBearer(request)).digest('hex');
  next();
};

export function ownerOf(response: Response): string {
  const owner = response.locals['owner'] as string | undefined;
  if (!owner) throw new Error('bearerGuard did not run for this route.');
  return owner;
}

export const idempotencyGuard: RequestHandler = (request, response, next) => {
  response.locals['idempotencyKey'] = requireIdempotencyKey(request);
  next();
};

export function idempotencyKeyOf(response: Response): string {
  const key = response.locals['idempotencyKey'] as string | undefined;
  if (!key) throw new Error('idempotencyGuard did not run for this route.');
  return key;
}

export function requireIdempotencyKey(request: Request): string {
  const key = request.get('idempotency-key')?.trim() ?? '';

  if (key.length === 0) {
    throw new ApiError(
      'bad_request',
      'Send an Idempotency-Key header. Anything that moves money needs one.',
    );
  }

  if (key.length > 255) {
    throw new ApiError('bad_request', 'The Idempotency-Key header is too long.');
  }

  return key;
}
