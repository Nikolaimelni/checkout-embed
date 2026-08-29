import { isCheckoutError } from '@checkout-embed/core';
import { describe, expect, it, vi } from 'vitest';
import { createFetchHttp } from './http-fetch.js';
import { createBrowserStorage } from './storage-local.js';

const auth = { getToken: async () => 'tok_live' };

function jsonResponse(status: number, body: unknown): Response {
  return { status, text: async () => JSON.stringify(body) } as Response;
}

function http(fetchImpl: unknown, overrides: Record<string, unknown> = {}) {
  return createFetchHttp({
    baseUrl: 'https://api.test/',
    auth,
    fetchImpl: fetchImpl as typeof fetch,
    ...overrides,
  });
}

describe('createFetchHttp', () => {
  it('sends the token, the body and the idempotency key', async () => {
    const fetchImpl = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () =>
      jsonResponse(201, { id: 'pi_1' }),
    );

    const response = await http(fetchImpl).send({
      method: 'POST',
      path: '/v1/payment-intents',
      body: { amountMinor: 1000 },
      idempotencyKey: 'key_1',
    });

    expect(response).toEqual({ status: 201, body: { id: 'pi_1' } });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test/v1/payment-intents');
    expect(init.headers).toMatchObject({
      authorization: 'Bearer tok_live',
      'idempotency-key': 'key_1',
      'content-type': 'application/json',
    });
    expect(init.body).toBe('{"amountMinor":1000}');
  });

  it('sends no content type when there is no body', async () => {
    const fetchImpl = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () =>
      jsonResponse(200, {}),
    );

    await http(fetchImpl).send({ method: 'GET', path: '/v1/payment-intents/pi_1' });

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.headers).not.toHaveProperty('content-type');
    expect(init.body).toBeUndefined();
  });

  it('asks the merchant for a fresh token once after a 401', async () => {
    const getToken = vi.fn(async () => 'tok_live');
    const fetchImpl = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse(401, { error: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(200, { id: 'pi_1' }));

    const response = await createFetchHttp({
      baseUrl: 'https://api.test',
      auth: { getToken },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }).send({ method: 'GET', path: '/v1/payment-intents/pi_1' });

    expect(response.status).toBe(200);
    expect(getToken).toHaveBeenNthCalledWith(1, undefined);
    expect(getToken).toHaveBeenNthCalledWith(2, { forceRefresh: true });
  });

  it('gives up after the second 401 rather than looping', async () => {
    const fetchImpl = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () =>
      jsonResponse(401, { error: 'expired' }),
    );

    const response = await http(fetchImpl).send({ method: 'GET', path: '/v1/config' });

    expect(response.status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('reports an unreachable provider as a retryable network error', async () => {
    const fetchImpl = async () => {
      throw new TypeError('Failed to fetch');
    };

    await expect(http(fetchImpl).send({ method: 'GET', path: '/v1/config' })).rejects.toSatisfy(
      (error: unknown) =>
        isCheckoutError(error) && error.code === 'network' && error.retryable === true,
    );
  });

  it('reports a provider that never answers as a timeout', async () => {
    const fetchImpl = (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });

    await expect(
      http(fetchImpl, { timeoutMs: 10 }).send({ method: 'GET', path: '/v1/config' }),
    ).rejects.toSatisfy((error: unknown) => isCheckoutError(error) && error.code === 'timeout');
  });

  it('keeps the status when a gateway answers with something that is not json', async () => {
    const fetchImpl = async () =>
      ({ status: 502, text: async () => '<html>bad gateway' }) as Response;

    const response = await http(fetchImpl).send({ method: 'GET', path: '/v1/config' });

    expect(response).toEqual({ status: 502, body: { raw: '<html>bad gateway' } });
  });

  it('treats an empty body as null rather than throwing on it', async () => {
    const fetchImpl = async () => ({ status: 204, text: async () => '' }) as Response;

    expect(await http(fetchImpl).send({ method: 'GET', path: '/v1/config' })).toEqual({
      status: 204,
      body: null,
    });
  });
});

describe('createBrowserStorage', () => {
  it('namespaces what it writes so a merchant s own keys stay theirs', async () => {
    const storage = createBrowserStorage({ view: window, namespace: 'ce' });

    await storage.write('session', 'abc');

    expect(window.localStorage.getItem('ce:session')).toBe('abc');
    expect(await storage.read('session')).toBe('abc');

    await storage.remove('session');
    expect(await storage.read('session')).toBeNull();
  });

  it('keeps working in memory when storage is blocked', async () => {
    const warn = vi.fn();
    const blocked = {
      get localStorage(): Storage {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    } as Window;

    const storage = createBrowserStorage({ view: blocked, warn });
    await storage.write('session', 'abc');

    expect(await storage.read('session')).toBe('abc');
    expect(warn).toHaveBeenCalledOnce();
  });

  it('reports nothing for a key it never wrote', async () => {
    expect(await createBrowserStorage({ view: window }).read('absent')).toBeNull();
  });
});
