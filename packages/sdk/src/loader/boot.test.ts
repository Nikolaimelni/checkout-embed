import { PROTOCOL_VERSION } from '@checkout-embed/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  boot,
  DEFAULT_GLOBAL_NAME,
  DEFAULT_RESOLVE_TIMEOUT_MS,
  installQueue,
  LOADER_PROTOCOL_VERSION,
  type QueueStub,
  readConfig,
  readSlot,
  resolveBundleUrl,
  writeSlot,
} from './boot.js';

const REMOTE_BUNDLE = 'https://cdn.test/checkout.4f2a.js';
const STATIC_BUNDLE = 'https://cdn.test/checkout.js';

function tag(attributes: Record<string, string>): HTMLScriptElement {
  const script = document.createElement('script');
  for (const [name, value] of Object.entries(attributes)) script.setAttribute(name, value);
  document.head.append(script);
  return script;
}

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

afterEach(() => {
  document.head.replaceChildren();
  writeSlot(window, DEFAULT_GLOBAL_NAME, undefined);
  writeSlot(window, 'acme', undefined);
});

describe('the protocol version baked into the loader', () => {
  it('matches the one in contracts', () => {
    // The loader carries a copy because it must not import a validator. Copies drift, so
    // this is the thing that stops them.
    expect(LOADER_PROTOCOL_VERSION).toBe(PROTOCOL_VERSION);
  });
});

describe('readConfig', () => {
  it('refuses a tag with no merchant key', () => {
    expect(readConfig(tag({}), 'https://shop.test')).toBeNull();
  });

  it('takes the api base from the script origin when the tag does not say', () => {
    const script = tag({ 'data-merchant-key': 'mk_test' });
    script.src = 'https://psp.test/loader.js';

    expect(readConfig(script, 'https://shop.test')).toMatchObject({
      merchantKey: 'mk_test',
      apiBaseUrl: 'https://psp.test',
      globalName: DEFAULT_GLOBAL_NAME,
      timeoutMs: DEFAULT_RESOLVE_TIMEOUT_MS,
    });
  });

  it('lets the tag override everything it should', () => {
    const script = tag({
      'data-merchant-key': 'mk_test',
      'data-api-base': 'https://api.test',
      'data-bundle': STATIC_BUNDLE,
      'data-global': 'acme',
      'data-timeout': '750',
      nonce: 'r4nd0m',
    });

    expect(readConfig(script, 'https://shop.test')).toEqual({
      merchantKey: 'mk_test',
      apiBaseUrl: 'https://api.test',
      staticBundleUrl: STATIC_BUNDLE,
      globalName: 'acme',
      timeoutMs: 750,
      nonce: 'r4nd0m',
    });
  });

  it.each(['', '0', '-1', 'soon'])('ignores the unusable timeout %j', (value) => {
    const script = tag({ 'data-merchant-key': 'mk_test', 'data-timeout': value });

    expect(readConfig(script, 'https://shop.test')?.timeoutMs).toBe(DEFAULT_RESOLVE_TIMEOUT_MS);
  });
});

describe('installQueue', () => {
  it('records calls made before the bundle arrives', () => {
    const view = window;

    const stub = installQueue(view, DEFAULT_GLOBAL_NAME);
    stub('init', { merchantKey: 'mk_test' });
    stub('mount', '#checkout');

    expect(stub.q).toEqual([
      ['init', { merchantKey: 'mk_test' }],
      ['mount', '#checkout'],
    ]);
    expect(stub.v).toBe(LOADER_PROTOCOL_VERSION);
  });

  it('keeps the queue a merchant already started', () => {
    const view = window;
    const first = installQueue(view, DEFAULT_GLOBAL_NAME);
    first('init', {});

    const second = installQueue(view, DEFAULT_GLOBAL_NAME);

    expect(second).toBe(first);
    expect(second.q).toHaveLength(1);
  });

  it('adopts a stub a merchant wrote by hand from the snippet', () => {
    const view = window;
    const handWritten = ((...args: unknown[]) => {
      handWritten.q = handWritten.q ?? [];
      handWritten.q.push(args);
    }) as QueueStub;
    handWritten('init', {});
    writeSlot(view, DEFAULT_GLOBAL_NAME, handWritten);

    const stub = installQueue(view, DEFAULT_GLOBAL_NAME);

    expect(stub).toBe(handWritten);
    expect(stub.q).toHaveLength(1);
    expect(stub.v).toBe(LOADER_PROTOCOL_VERSION);
  });
});

describe('resolveBundleUrl', () => {
  const config = {
    merchantKey: 'mk_test',
    apiBaseUrl: 'https://api.test/',
    staticBundleUrl: STATIC_BUNDLE,
    globalName: DEFAULT_GLOBAL_NAME,
    timeoutMs: 50,
    nonce: null,
  } as const;

  it('asks the backend and takes its answer', async () => {
    const fetchImpl = vi.fn(async () => okResponse({ bundleUrl: REMOTE_BUNDLE }));
    const onFallback = vi.fn();

    const url = await resolveBundleUrl(config, { fetchImpl: fetchImpl as never, onFallback });

    expect(url).toBe(REMOTE_BUNDLE);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.test/v1/config/mk_test',
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(onFallback).not.toHaveBeenCalled();
  });

  it.each([
    ['a refusal', async () => ({ ok: false, status: 503 }) as Response, '503'],
    ['a body with no bundleUrl', async () => okResponse({}), 'no bundleUrl'],
    [
      'a network failure',
      async () => {
        throw new Error('Failed to fetch');
      },
      'Failed to fetch',
    ],
  ])('falls back on %s and says why', async (_label, impl, expected) => {
    const onFallback = vi.fn();

    const url = await resolveBundleUrl(config, { fetchImpl: impl as never, onFallback });

    expect(url).toBe(STATIC_BUNDLE);
    expect(onFallback.mock.calls[0]?.[0]).toContain(expected);
  });

  it('gives up on a backend that never answers', async () => {
    const onFallback = vi.fn();
    const hang = ((_url: string, init: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')));
      })) as never;

    const url = await resolveBundleUrl(config, { fetchImpl: hang, onFallback });

    expect(url).toBe(STATIC_BUNDLE);
    expect(onFallback).toHaveBeenCalledOnce();
  });

  it('says so when there is nothing to fall back to', async () => {
    const onFallback = vi.fn();
    const impl = (async () => ({ ok: false, status: 500 }) as Response) as never;

    const url = await resolveBundleUrl(
      { ...config, staticBundleUrl: null },
      { fetchImpl: impl, onFallback },
    );

    expect(url).toBeNull();
    expect(onFallback.mock.calls[0]?.[0]).toContain('no data-bundle');
  });
});

describe('boot', () => {
  it('installs the queue and injects the resolved bundle', async () => {
    tag({ 'data-merchant-key': 'mk_test', 'data-api-base': 'https://api.test' });
    const warn = vi.fn();

    const url = await boot({
      view: window,
      document,
      fetchImpl: (async () => okResponse({ bundleUrl: REMOTE_BUNDLE })) as never,
      warn,
    });

    expect(url).toBe(REMOTE_BUNDLE);
    expect(typeof readSlot(window, DEFAULT_GLOBAL_NAME)).toBe('function');
    const injected = document.querySelector<HTMLScriptElement>(`script[src="${REMOTE_BUNDLE}"]`);
    expect(injected?.type).toBe('module');
    expect(warn).not.toHaveBeenCalled();
  });

  it('passes a nonce on to the script it injects, or a strict page blocks it', async () => {
    tag({ 'data-merchant-key': 'mk_test', 'data-api-base': 'https://api.test', nonce: 'r4nd0m' });

    await boot({
      view: window,
      document,
      fetchImpl: (async () => okResponse({ bundleUrl: REMOTE_BUNDLE })) as never,
      warn: vi.fn(),
    });

    expect(document.querySelector(`script[src="${REMOTE_BUNDLE}"]`)?.getAttribute('nonce')).toBe(
      'r4nd0m',
    );
  });

  it('still queues calls when the bundle cannot be found at all', async () => {
    tag({ 'data-merchant-key': 'mk_test', 'data-api-base': 'https://api.test' });
    const warn = vi.fn();

    const url = await boot({
      view: window,
      document,
      fetchImpl: (async () => ({ ok: false, status: 500 }) as Response) as never,
      warn,
    });

    expect(url).toBeNull();
    // The queue matters more than the bundle here: a merchant calling init() into thin air
    // would throw and take their checkout page with it.
    expect(typeof readSlot(window, DEFAULT_GLOBAL_NAME)).toBe('function');
    expect(warn).toHaveBeenCalled();
  });

  it('says something useful when the tag has no merchant key', async () => {
    tag({ src: 'https://psp.test/loader.js' });
    const warn = vi.fn();

    const url = await boot({ view: window, document, warn });

    expect(url).toBeNull();
    expect(warn.mock.calls[0]?.[0]).toContain('script tag');
  });
});
