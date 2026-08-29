import { isCheckoutError } from '@checkout-embed/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakePsp } from '../testing/fake-psp.js';
import { init, terminateAll } from './instance.js';

const config = {
  merchantKey: 'mk_test_acme',
  environment: 'sandbox',
  apiBaseUrl: 'https://api.test',
} as const;

const auth = { getToken: async () => 'tok_live' };
const amount = { amountMinor: 1000, currency: 'EUR' } as const;

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

function host(id = 'checkout'): HTMLElement {
  const element = document.createElement('div');
  element.id = id;
  document.body.append(element);
  return element;
}

function instanceWith(psp = createFakePsp()) {
  return init({ config, auth, fetchImpl: psp.fetch });
}

afterEach(() => {
  terminateAll();
  document.body.replaceChildren();
});

describe('init', () => {
  it('refuses a config the schema does not accept', () => {
    expect(() => init({ config: { ...config, apiBaseUrl: 'api.test' }, auth })).toThrow(
      /not usable/,
    );
  });

  it('names the field that was wrong', () => {
    try {
      init({ config: { ...config, merchantKey: '' }, auth });
      expect.unreachable('an empty merchant key should not be accepted');
    } catch (error) {
      expect(isCheckoutError(error)).toBe(true);
      expect((error as Error).message).toContain('merchantKey');
    }
  });

  it('hands the same instance to everyone who asks for the same merchant', () => {
    expect(instanceWith()).toBe(instanceWith());
  });

  it('gives a fresh one after the first was terminated', () => {
    const first = instanceWith();
    first.terminate();

    expect(instanceWith()).not.toBe(first);
  });

  it('fills in the parts of the config the merchant left out', () => {
    expect(instanceWith().config).toMatchObject({ locale: 'en', theme: 'system' });
  });
});

describe('mount', () => {
  it('renders into a shadow root on the element it was given', async () => {
    const element = host();

    instanceWith().mount(element, { amount });
    await settled();

    expect(element.shadowRoot?.textContent).toContain('Choose how to pay');
  });

  it('accepts a selector', async () => {
    host('pay-here');

    instanceWith().mount('#pay-here', { amount });
    await settled();

    expect(document.querySelector('#pay-here')?.shadowRoot?.textContent).toContain('Card');
  });

  it('says so when the selector matches nothing', () => {
    expect(() => instanceWith().mount('#missing', { amount })).toThrow(/Nothing on the page/);
  });

  it('walks a payment through to a receipt', async () => {
    const element = host();
    const succeeded = vi.fn();
    const instance = instanceWith();
    instance.on('payment:success', succeeded);

    instance.mount(element, { amount, preselectedMethodId: FAKE_CARD });
    await settled();

    const pay = [...(element.shadowRoot?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent === 'Pay',
    );
    pay?.click();
    await settled();

    expect(element.shadowRoot?.textContent).toContain('Payment complete');
    expect(succeeded).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'payment:success', intentId: 'pi_fake' }),
    );
  });

  it('reports a provider that will not answer instead of showing a spinner forever', async () => {
    const element = host();
    const failed = vi.fn();
    const instance = init({
      config,
      auth,
      fetchImpl: createFakePsp({ configStatus: 500 }).fetch,
    });
    instance.on('payment:error', failed);

    instance.mount(element, { amount });
    await settled();

    expect(failed).toHaveBeenCalledOnce();
    expect(element.shadowRoot?.textContent).not.toContain('Loading payment methods');
  });

  it('takes the widget back out on unmount', async () => {
    const element = host();
    const handle = instanceWith().mount(element, { amount });
    await settled();

    handle.unmount();

    expect(element.shadowRoot?.textContent).toBe('');
  });

  it('ignores a second unmount rather than tearing down twice', async () => {
    const element = host();
    const handle = instanceWith().mount(element, { amount });
    await settled();

    handle.unmount();

    expect(() => handle.unmount()).not.toThrow();
  });
});

describe('update', () => {
  it('pushes a blocking message into a mounted widget', async () => {
    const element = host();
    const instance = instanceWith();
    instance.mount(element, { amount });
    await settled();

    instance.update({ blockingMessage: 'Your account is under review.' });
    await settled();

    expect(element.shadowRoot?.textContent).toContain('Your account is under review.');
  });

  it('reaches every widget the instance has mounted', async () => {
    const first = host('one');
    const second = host('two');
    const instance = instanceWith();
    instance.mount(first, { amount });
    instance.mount(second, { amount });
    await settled();

    instance.update({ blockingMessage: 'Closed for maintenance.' });

    await vi.waitFor(() => {
      expect(first.shadowRoot?.textContent).toContain('Closed for maintenance.');
      expect(second.shadowRoot?.textContent).toContain('Closed for maintenance.');
    });
  });

  it('applies to a widget mounted after the update', async () => {
    const instance = instanceWith();
    instance.update({ blockingMessage: 'Closed.' });

    const element = host();
    instance.mount(element, { amount });
    await settled();

    expect(element.shadowRoot?.textContent).toContain('Closed.');
  });

  it('refuses a shape the host protocol does not allow', () => {
    const instance = instanceWith();

    expect(() => instance.update({ limits: { minMinor: 'a lot' } as unknown as never })).toThrow(
      /host protocol/,
    );
  });
});

describe('terminate', () => {
  it('unmounts everything and stops answering', async () => {
    const element = host();
    const instance = instanceWith();
    instance.mount(element, { amount });
    await settled();

    instance.terminate();

    expect(element.shadowRoot?.textContent).toBe('');
    expect(() => instance.mount(element, { amount })).toThrow(/terminated/);
  });

  it('stops delivering events to listeners the merchant registered', async () => {
    const listener = vi.fn();
    const instance = instanceWith();
    instance.on('payment:success', listener);

    instance.terminate();
    await settled();

    expect(listener).not.toHaveBeenCalled();
  });

  it('does nothing the second time', () => {
    const instance = instanceWith();
    instance.terminate();

    expect(() => instance.terminate()).not.toThrow();
  });
});

const FAKE_CARD = 'pm_card' as never;
