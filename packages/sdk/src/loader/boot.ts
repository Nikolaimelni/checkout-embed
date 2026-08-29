/**
 * Everything in this file ships in the tag a merchant pastes into their page, so it has
 * no imports at all. Not from contracts, not from core, nothing that drags a validator in
 * behind it. The protocol version below is a copy of the one in contracts; a test keeps
 * the two honest.
 */
export const LOADER_PROTOCOL_VERSION = 1;

export const DEFAULT_GLOBAL_NAME = 'checkoutEmbed';

/** Long enough for a cold backend, short enough that nobody watches a blank box. */
export const DEFAULT_RESOLVE_TIMEOUT_MS = 3_000;

export type LoaderConfig = {
  readonly merchantKey: string;
  readonly apiBaseUrl: string;
  /** Used when the backend cannot be reached. Falling back to nothing helps nobody. */
  readonly staticBundleUrl: string | null;
  readonly globalName: string;
  readonly timeoutMs: number;
  readonly nonce: string | null;
};

/**
 * The stub a merchant calls before the real bundle has arrived. Calls pile up on `q` and
 * the runtime replays them in order; `v` is what lets the runtime notice that this loader
 * was cached six months ago and refuse to guess what its calls meant.
 */
export type QueueStub = {
  (...args: unknown[]): void;
  q?: unknown[][];
  v?: number;
};

/**
 * The global a merchant's tag installs is looked up by a name from an attribute, so it
 * cannot be a declared property. These two keep that dynamic access in one place instead
 * of widening Window with an index signature, which would swallow console and fetch too.
 */
export function readSlot(view: Window, name: string): unknown {
  return (view as unknown as Record<string, unknown>)[name];
}

export function writeSlot(view: Window, name: string, value: unknown): void {
  (view as unknown as Record<string, unknown>)[name] = value;
}

function attribute(element: Element, name: string): string | null {
  const value = element.getAttribute(name);
  return value === null || value.trim().length === 0 ? null : value.trim();
}

function originOf(url: string, fallback: string): string {
  try {
    return new URL(url, fallback).origin;
  } catch {
    return fallback;
  }
}

export function findOwnScript(document: Document): HTMLScriptElement | null {
  const current = document.currentScript;
  if (current instanceof HTMLScriptElement) return current;

  // document.currentScript is null inside a module or when the tag was injected, so fall
  // back to the attribute that identifies us.
  return document.querySelector<HTMLScriptElement>('script[data-merchant-key]');
}

export function readConfig(script: HTMLScriptElement, pageOrigin: string): LoaderConfig | null {
  const merchantKey = attribute(script, 'data-merchant-key');
  if (merchantKey === null) return null;

  const timeout = Number(attribute(script, 'data-timeout'));

  return {
    merchantKey,
    apiBaseUrl: attribute(script, 'data-api-base') ?? originOf(script.src, pageOrigin),
    staticBundleUrl: attribute(script, 'data-bundle'),
    globalName: attribute(script, 'data-global') ?? DEFAULT_GLOBAL_NAME,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_RESOLVE_TIMEOUT_MS,
    nonce: attribute(script, 'nonce') ?? script.nonce ?? null,
  };
}

/**
 * Idempotent. A merchant who pastes the tag into both the layout and the checkout page
 * gets one queue, not two, and whatever they already pushed into it survives.
 */
export function installQueue(view: Window, globalName: string): QueueStub {
  const existing = readSlot(view, globalName) as QueueStub | undefined;

  if (typeof existing === 'function') {
    existing.q = existing.q ?? [];
    existing.v = existing.v ?? LOADER_PROTOCOL_VERSION;
    return existing;
  }

  const stub: QueueStub = (...args: unknown[]) => {
    stub.q = stub.q ?? [];
    stub.q.push(args);
  };

  stub.q = [];
  stub.v = LOADER_PROTOCOL_VERSION;
  writeSlot(view, globalName, stub);

  return stub;
}

export type ResolveOptions = {
  readonly fetchImpl: typeof fetch;
  readonly onFallback: (reason: string) => void;
};

/**
 * Asks the backend where the bundle lives, and falls back to the address baked into the
 * tag when it cannot. Resolving from the backend is what lets a fix ship without every
 * merchant redeploying; the fallback is what stops that hook from being a single point of
 * failure in front of somebody's checkout.
 */
export async function resolveBundleUrl(
  config: LoaderConfig,
  options: ResolveOptions,
): Promise<string | null> {
  const url = `${config.apiBaseUrl.replace(/\/$/, '')}/v1/config/${encodeURIComponent(config.merchantKey)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await options.fetchImpl(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`the config endpoint answered ${response.status}`);

    const body: unknown = await response.json();
    const bundleUrl = (body as { bundleUrl?: unknown }).bundleUrl;
    if (typeof bundleUrl !== 'string' || bundleUrl.length === 0) {
      throw new Error('the config had no bundleUrl');
    }

    return bundleUrl;
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    options.onFallback(
      config.staticBundleUrl === null
        ? `${reason}, and the tag carries no data-bundle to fall back to`
        : `${reason}, falling back to data-bundle`,
    );
    return config.staticBundleUrl;
  } finally {
    clearTimeout(timer);
  }
}

export function injectBundle(document: Document, config: LoaderConfig, bundleUrl: string): void {
  const script = document.createElement('script');
  script.type = 'module';
  script.async = true;
  script.src = bundleUrl;
  script.crossOrigin = 'anonymous';
  script.dataset['checkoutEmbedGlobal'] = config.globalName;

  // A merchant with a strict policy hands us a nonce on their tag; without passing it on,
  // the script we inject is the one thing their CSP blocks.
  if (config.nonce !== null) script.setAttribute('nonce', config.nonce);

  (document.head ?? document.documentElement).append(script);
}

export type BootOptions = {
  readonly view: Window;
  readonly document: Document;
  readonly fetchImpl?: typeof fetch;
  readonly warn?: (message: string) => void;
};

export async function boot(options: BootOptions): Promise<string | null> {
  const { view, document } = options;
  const warn = options.warn ?? ((message: string) => console.warn(message));
  const fetchImpl = options.fetchImpl ?? view.fetch?.bind(view);

  const script = findOwnScript(document);
  if (script === null) {
    warn(
      'checkout-embed: could not find its own script tag, so there is nothing to configure from',
    );
    return null;
  }

  const config = readConfig(script, view.location?.origin ?? '');
  if (config === null) {
    warn('checkout-embed: the script tag has no data-merchant-key');
    return null;
  }

  installQueue(view, config.globalName);

  if (typeof fetchImpl !== 'function') {
    warn('checkout-embed: this browser has no fetch, using data-bundle');
    if (config.staticBundleUrl === null) return null;
    injectBundle(document, config, config.staticBundleUrl);
    return config.staticBundleUrl;
  }

  const bundleUrl = await resolveBundleUrl(config, {
    fetchImpl,
    onFallback: (reason) => warn(`checkout-embed: could not resolve the bundle (${reason})`),
  });

  if (bundleUrl === null) {
    warn('checkout-embed: no bundle to load, the widget will not appear');
    return null;
  }

  injectBundle(document, config, bundleUrl);
  return bundleUrl;
}
