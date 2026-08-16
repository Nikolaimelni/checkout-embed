import type { NextFunction, Request, Response } from 'express';
import { log } from '../observability/context.ts';

export type ApiErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'not_found'
  | 'conflict'
  | 'idempotency_conflict'
  | 'rate_limited'
  | 'internal';

const STATUS: Readonly<Record<ApiErrorCode, number>> = {
  bad_request: 400,
  unauthorized: 401,
  not_found: 404,
  conflict: 409,
  idempotency_conflict: 409,
  rate_limited: 429,
  internal: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly detail: Readonly<Record<string, unknown>> | undefined;

  constructor(code: ApiErrorCode, message: string, detail?: Readonly<Record<string, unknown>>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = STATUS[code];
    this.detail = detail;
  }
}

export function notFoundHandler(_request: Request, response: Response): void {
  response
    .status(404)
    .json({ error: { code: 'not_found', message: 'No route matches this path.' } });
}

/**
 * The only place that turns a thrown thing into a status code. Handlers throw ApiError and
 * stop caring; anything else is a bug and is reported as one without leaking its message.
 */
export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error instanceof ApiError) {
    log().warn({ code: error.code, detail: error.detail }, error.message);
    response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.detail ? { detail: error.detail } : {}),
      },
    });
    return;
  }

  log().error({ err: error }, 'unhandled error');
  response
    .status(500)
    .json({ error: { code: 'internal', message: 'Something broke on our side.' } });
}
