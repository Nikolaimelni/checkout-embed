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

    expect(parsed).toMatchObject({ locale: 'en', theme: 'system', components: {} });
  });

  it('rejects an apiBaseUrl that is not a url', () => {
    expect(
      CheckoutConfigSchema.safeParse({ ...minimal, apiBaseUrl: 'psp.example.com' }).success,
    ).toBe(false);
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
});
