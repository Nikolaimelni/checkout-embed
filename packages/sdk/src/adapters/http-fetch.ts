import {
  type AbortLike,
  type AuthAdapter,
  CheckoutError,
  type HttpAdapter,
  type HttpRequest,
  type HttpResponse,
} from '@checkout-embed/core';

export type FetchHttpOptions = {
  readonly baseUrl: string;
  readonly auth: AuthAdapter;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
};

export const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Forwards an abort from the caller to our own controller. Two signals rather than one
 * because the timeout is ours and the cancellation is theirs, and either should be able
 * to stop the request without the other knowing.
 */
function linkAbort(controller: AbortController, signal: AbortLike | undefined): () => void {
  if (!signal) return () => {};
  if (signal.aborted) {
    controller.abort();
    return () => {};
  }

  const forward = () => controller.abort();
  signal.addEventListener('abort', forward);
  return () => signal.removeEventListener('abort', forward);
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    // A gateway between us and the provider answering with HTML is a normal Tuesday, and
    // the status code is still worth reporting.
    return { raw: text };
  }
}

export function createFetchHttp(options: FetchHttpOptions): HttpAdapter {
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const base = options.baseUrl.replace(/\/$/, '');

  async function send(request: HttpRequest, forceRefresh: boolean): Promise<HttpResponse> {
    const controller = new AbortController();
    const unlink = linkAbort(controller, request.signal);
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const headers: Record<string, string> = {
      accept: 'application/json',
      authorization: `Bearer ${await options.auth.getToken(forceRefresh ? { forceRefresh } : undefined)}`,
      ...request.headers,
    };

    if (request.body !== undefined) headers['content-type'] = 'application/json';
    if (request.idempotencyKey !== undefined) {
      headers['idempotency-key'] = request.idempotencyKey;
    }

    try {
      const response = await fetchImpl(`${base}${request.path}`, {
        method: request.method,
        headers,
        signal: controller.signal,
        ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
      });

      return { status: response.status, body: await readBody(response) };
    } catch (cause) {
      if (controller.signal.aborted) {
        throw new CheckoutError('timeout', 'The payment provider did not answer in time.', {
          cause,
          retryable: true,
        });
      }

      throw new CheckoutError('network', 'The payment provider could not be reached.', {
        cause,
        retryable: true,
      });
    } finally {
      clearTimeout(timer);
      unlink();
    }
  }

  return {
    async send(request) {
      const first = await send(request, false);

      // One retry, and only for a 401. The merchant's token callback is the thing that
      // knows how to mint a new one, and asking it twice for the same request is the most
      // anyone should do on their behalf.
      if (first.status !== 401) return first;

      return send(request, true);
    },
  };
}
