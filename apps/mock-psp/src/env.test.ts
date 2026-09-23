import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.ts';

const production = {
  NODE_ENV: 'production',
  WEBHOOK_SECRET: 'a-real-secret-of-some-length',
  ALLOWED_ORIGINS: 'https://shop.example',
  PUBLIC_BASE_URL: 'https://psp.example',
  WIDGET_BUNDLE_URL: 'https://cdn.example/bundle.js',
};

describe('loadEnv', () => {
  it('points the loader at the bundle the plain demo actually serves', () => {
    expect(loadEnv({}).WIDGET_BUNDLE_URL).toBe('http://localhost:5174/sdk/bundle.js');
  });

  it('boots production with real values', () => {
    expect(loadEnv(production).allowedOrigins).toEqual(['https://shop.example']);
  });

  it('refuses to answer every origin in production', () => {
    expect(() => loadEnv({ ...production, ALLOWED_ORIGINS: '*' })).toThrow(/ALLOWED_ORIGINS/);
  });

  it('refuses the development webhook secret in production', () => {
    const { WEBHOOK_SECRET: _secret, ...rest } = production;

    expect(() => loadEnv(rest)).toThrow(/WEBHOOK_SECRET/);
  });

  it.each(['https://shop.example/', 'https://shop.example/checkout', 'shop.example'])(
    'refuses %s as an origin, which cors would never match',
    (origin) => {
      expect(() => loadEnv({ ALLOWED_ORIGINS: origin })).toThrow(/not origins/);
    },
  );

  it.each([
    ['PUBLIC_BASE_URL', 'http://psp.example'],
    ['WIDGET_BUNDLE_URL', 'http://cdn.example/bundle.js'],
    ['WEBHOOK_URL', 'http://hooks.example/in'],
  ])('refuses %s over plain http off localhost', (name, value) => {
    expect(() => loadEnv({ [name]: value })).toThrow(new RegExp(name));
  });

  it('refuses an integrity value that is not one', () => {
    expect(() => loadEnv({ WIDGET_BUNDLE_INTEGRITY: 'md5-abc' })).toThrow(
      /WIDGET_BUNDLE_INTEGRITY/,
    );
  });
});
