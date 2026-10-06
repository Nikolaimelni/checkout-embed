import {
  type AbortLike,
  type AuthAdapter,
  CheckoutError,
  type HttpAdapter,
  type HttpRequest,
  type HttpResponse,
  isCheckoutError,
} from '@checkout-embed/core';

export type FetchHttpOptions = {
  readonly baseUrl: string;
  readonly auth: AuthAdapter;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
};

export const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

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

function rejectOnAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

export function createFetchHttp(options: FetchHttpOptions): HttpAdapter {
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const base = options.baseUrl.replace(/\/$/, '');

  async function requestToken(forceRefresh: boolean): Promise<string> {
    try {
      return await options.auth.getToken(forceRefresh ? { forceRefresh } : undefined);
    } catch (cause) {
      throw new CheckoutError('network', 'Could not get a checkout token from the shop.', {
        cause,
        retryable: true,
      });
    }
  }

  async function send(request: HttpRequest, forceRefresh: boolean): Promise<HttpResponse> {
    const controller = new AbortController();
    const unlink = linkAbort(controller, request.signal);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      // the token callback shares the timeout, or a hung callback hangs the payment
      const token = await Promise.race([
        requestToken(forceRefresh),
        rejectOnAbort(controller.signal),
      ]);

      const headers: Record<string, string> = {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        ...request.headers,
      };

      if (request.body !== undefined) headers['content-type'] = 'application/json';
      if (request.idempotencyKey !== undefined) {
        headers['idempotency-key'] = request.idempotencyKey;
      }

      const response = await fetchImpl(`${base}${request.path}`, {
        method: request.method,
        headers,
        signal: controller.signal,
        ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
      });

      return { status: response.status, body: await readBody(response) };
    } catch (cause) {
      if (isCheckoutError(cause)) throw cause;

      if (timedOut) {
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

      if (first.status !== 401) return first;

      return send(request, true);
    },
  };
}
