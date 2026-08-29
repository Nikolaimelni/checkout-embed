import { PROTOCOL_VERSION } from '@checkout-embed/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { terminateAll } from '../lifecycle/instance.js';
import { installQueue, readSlot, writeSlot } from '../loader/boot.js';
import { createFakePsp } from '../testing/fake-psp.js';
import { bootstrap, drainQueue } from './drain.js';

const GLOBAL = 'checkoutEmbed';

const options = () => ({
  config: { merchantKey: 'mk_test_acme', environment: 'sandbox', apiBaseUrl: 'https://api.test' },
  auth: { getToken: async () => 'tok_live' },
  fetchImpl: createFakePsp().fetch,
});

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

function host(id: string): HTMLElement {
  const element = document.createElement('div');
  element.id = id;
  document.body.append(element);
  return element;
}

function call(name: string): (...args: unknown[]) => void {
  return readSlot(window, name) as (...args: unknown[]) => void;
}

afterEach(() => {
  terminateAll();
  writeSlot(window, GLOBAL, undefined);
  writeSlot(window, 'acme', undefined);
  document.body.replaceChildren();
  document.head.replaceChildren();
});

describe('drainQueue', () => {
  it('replays what a merchant called before the bundle arrived', async () => {
    host('checkout');
    const succeeded = vi.fn();
    const stub = installQueue(window, GLOBAL);

    stub('init', options());
    stub('on', 'payment:success', succeeded);
    stub('mount', '#checkout', { amount: { amountMinor: 1000, currency: 'EUR' } });

    const instance = drainQueue({ view: window, warn: vi.fn() });
    await settled();

    expect(instance).not.toBeNull();
    expect(document.querySelector('#checkout')?.shadowRoot?.textContent).toContain(
      'Choose how to pay',
    );
  });

  it('keeps working for calls made after it has drained', async () => {
    host('later');
    installQueue(window, GLOBAL)('init', options());

    drainQueue({ view: window, warn: vi.fn() });
    call(GLOBAL)('mount', '#later', { amount: { amountMinor: 1000, currency: 'EUR' } });
    await settled();

    expect(document.querySelector('#later')?.shadowRoot?.textContent).toContain('Card');
  });

  it('refuses to replay a queue from a loader on another protocol version', async () => {
    host('checkout');
    const stub = installQueue(window, GLOBAL);
    stub.v = PROTOCOL_VERSION + 1;
    stub('init', options());
    stub('mount', '#checkout', { amount: { amountMinor: 1000, currency: 'EUR' } });
    const warn = vi.fn();

    const instance = drainQueue({ view: window, warn });
    await settled();

    expect(instance).toBeNull();
    expect(document.querySelector('#checkout')?.shadowRoot).toBeNull();
    expect(warn.mock.calls[0]?.[0]).toContain(String(PROTOCOL_VERSION + 1));
    expect(warn.mock.calls[0]?.[0]).toContain('2 queued calls were dropped');
  });

  it('still answers new calls after refusing a stale queue', async () => {
    host('fresh');
    const stub = installQueue(window, GLOBAL);
    stub.v = 99;
    stub('init', options());

    drainQueue({ view: window, warn: vi.fn() });
    call(GLOBAL)('init', options());
    call(GLOBAL)('mount', '#fresh', { amount: { amountMinor: 1000, currency: 'EUR' } });
    await settled();

    expect(document.querySelector('#fresh')?.shadowRoot?.textContent).toContain('Card');
  });

  it('reports a command it does not know and carries on with the rest', async () => {
    host('checkout');
    const stub = installQueue(window, GLOBAL);
    stub('init', options());
    stub('teleport', '#checkout');
    stub('mount', '#checkout', { amount: { amountMinor: 1000, currency: 'EUR' } });
    const warn = vi.fn();

    drainQueue({ view: window, warn });
    await settled();

    expect(warn.mock.calls[0]?.[0]).toContain('teleport');
    expect(document.querySelector('#checkout')?.shadowRoot?.textContent).toContain('Card');
  });

  it('does not let one bad call swallow the ones behind it', async () => {
    host('checkout');
    const succeeded = vi.fn();
    const stub = installQueue(window, GLOBAL);
    stub('init', options());
    stub('mount', '#nothing-here', { amount: { amountMinor: 1000, currency: 'EUR' } });
    stub('on', 'payment:success', succeeded);
    stub('mount', '#checkout', { amount: { amountMinor: 1000, currency: 'EUR' } });
    const warn = vi.fn();

    drainQueue({ view: window, warn });
    await settled();

    expect(warn.mock.calls[0]?.[0]).toContain('Nothing on the page');
    expect(document.querySelector('#checkout')?.shadowRoot?.textContent).toContain('Card');
  });

  it('complains rather than throwing when mount comes before init', () => {
    const stub = installQueue(window, GLOBAL);
    stub('mount', '#checkout', { amount: { amountMinor: 1000, currency: 'EUR' } });
    const warn = vi.fn();

    expect(() => drainQueue({ view: window, warn })).not.toThrow();
    expect(warn.mock.calls[0]?.[0]).toContain('Call init()');
  });

  it('does nothing on a page with no loader at all', () => {
    expect(drainQueue({ view: window, warn: vi.fn() })).toBeNull();
  });
});

describe('bootstrap', () => {
  it('finds the global name the loader wrote on the script it injected', async () => {
    host('checkout');
    const injected = document.createElement('script');
    injected.dataset['checkoutEmbedGlobal'] = 'acme';
    document.head.append(injected);

    const stub = installQueue(window, 'acme');
    stub('init', options());
    stub('mount', '#checkout', { amount: { amountMinor: 1000, currency: 'EUR' } });

    const instance = bootstrap(window);
    await settled();

    expect(instance).not.toBeNull();
    expect(document.querySelector('#checkout')?.shadowRoot?.textContent).toContain('Card');
  });

  it('falls back to the default name when no script says otherwise', () => {
    installQueue(window, GLOBAL)('init', options());

    expect(bootstrap(window)).not.toBeNull();
  });
});
