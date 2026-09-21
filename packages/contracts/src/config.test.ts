import { describe, expect, it } from 'vitest';
import { CheckoutConfigSchema, RemoteWidgetConfigSchema } from './config.js';

const minimal = {
  merchantKey: 'mk_test_1',
  environment: 'sandbox',
  apiBaseUrl: 'https://psp.example.com',
} as const;

describe('CheckoutConfigSchema', () => {
  it('fills in the optional half so the widget never reads undefined', () => {
    const parsed = CheckoutConfigSchema.parse(minimal);

    expect(parsed).toMatchObject({ locale: 'en', components: {} });
  });

  it('rejects an apiBaseUrl that is not a url', () => {
    expect(
      CheckoutConfigSchema.safeParse({ ...minimal, apiBaseUrl: 'psp.example.com' }).success,
    ).toBe(false);
  });

  it.each(['en_US', 'e', ''])('rejects the locale %j before Intl gets to throw on it', (locale) => {
    expect(CheckoutConfigSchema.safeParse({ ...minimal, locale }).success).toBe(false);
  });

  it('keeps a locale Intl understands', () => {
    expect(CheckoutConfigSchema.parse({ ...minimal, locale: 'de-CH' }).locale).toBe('de-CH');
  });

  it.each(['data:text/plain,hi', 'ftp://psp.example.com'])(
    'rejects the apiBaseUrl %s even in the sandbox',
    (apiBaseUrl) => {
      expect(CheckoutConfigSchema.safeParse({ ...minimal, apiBaseUrl }).success).toBe(false);
    },
  );

  it('refuses a live checkout that would talk to its provider in plain http', () => {
    const live = { ...minimal, environment: 'live', apiBaseUrl: 'http://psp.example.com' };

    expect(CheckoutConfigSchema.safeParse(live).success).toBe(false);
    expect(CheckoutConfigSchema.safeParse({ ...live, environment: 'sandbox' }).success).toBe(true);
  });

  it('rejects a component name the custom element registry would throw on', () => {
    const result = CheckoutConfigSchema.safeParse({
      ...minimal,
      components: { button: 'AcmeButton' },
    });

    expect(result.success).toBe(false);
  });

  it('keeps a valid host component', () => {
    const parsed = CheckoutConfigSchema.parse({
      ...minimal,
      components: { button: 'acme-button' },
    });

    expect(parsed.components.button).toBe('acme-button');
  });
});

describe('RemoteWidgetConfigSchema', () => {
  it('carries the protocol version the backend expects the loader to speak', () => {
    const parsed = RemoteWidgetConfigSchema.parse({
      bundleUrl: 'https://cdn.example.com/checkout.js',
      protocolVersion: 1,
      methods: [{ id: 'pm_card', kind: 'card', label: 'Card' }],
    });

    expect(parsed.protocolVersion).toBe(1);
    expect(parsed.methods).toHaveLength(1);
  });

  it('refuses a bundle the loader would fetch over plain http', () => {
    const result = RemoteWidgetConfigSchema.safeParse({
      bundleUrl: 'http://cdn.example.com/checkout.js',
      protocolVersion: 1,
      methods: [],
    });

    expect(result.success).toBe(false);
  });

  it('carries an integrity value when the provider pins the bundle', () => {
    const integrity = 'sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC';

    const parsed = RemoteWidgetConfigSchema.parse({
      bundleUrl: 'https://cdn.example.com/checkout.js',
      integrity,
      protocolVersion: 1,
      methods: [],
    });

    expect(parsed.integrity).toBe(integrity);
  });
});
