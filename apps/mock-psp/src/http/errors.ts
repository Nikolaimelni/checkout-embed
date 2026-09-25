import type { NextFunction, Request, Response } from 'express';
import { log } from '../observability/context.ts';

export type ApiErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'not_found'
  | 'conflict'
  | 'idempotency_conflict'
  | 'payload_too_large'
  | 'rate_limited'
  | 'internal';

const STATUS: Readonly<Record<ApiErrorCode, number>> = {
  bad_request: 400,
  unauthorized: 401,
  not_found: 404,
  conflict: 409,
  idempotency_conflict: 409,
  payload_too_large: 413,
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

/** express.json() throws http-errors objects. A 4xx there is the client's, and 500 would make the SDK retry. */
function fromBodyParser(error: unknown): ApiError | null {
  if (!(error instanceof Error) || !('status' in error)) return null;

  if (error.status === 413) {
    return new ApiError('payload_too_large', 'The request body is too large.');
  }
  if (typeof error.status === 'number' && error.status >= 400 && error.status < 500) {
    return new ApiError('bad_request', 'The request body could not be read as JSON.');
  }

  return null;
}

/** Anything that is not an ApiError is a bug, answered without leaking its message. */
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

  const known = error instanceof ApiError ? error : fromBodyParser(error);

  if (known) {
    log().warn({ code: known.code, detail: known.detail }, known.message);
    response.status(known.status).json({
      error: {
        code: known.code,
        message: known.message,
        ...(known.detail ? { detail: known.detail } : {}),
      },
    });
    return;
  }

  log().error({ err: error }, 'unhandled error');
  response
    .status(500)
    .json({ error: { code: 'internal', message: 'Something broke on our side.' } });
}
