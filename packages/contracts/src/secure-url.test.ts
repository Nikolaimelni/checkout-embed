import { describe, expect, it } from 'vitest';
import { IntegritySchema, SecureUrlSchema } from './secure-url.js';

describe('SecureUrlSchema', () => {
  it.each([
    'https://cdn.example.com/bundle.js',
    'http://localhost:5174/sdk/bundle.js',
    'http://127.0.0.1:4000/3ds/pi_1',
    'http://[::1]:4000/3ds/pi_1',
    'http://psp.localhost/3ds/pi_1',
  ])('accepts %s', (value) => {
    expect(SecureUrlSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    'http://cdn.example.com/bundle.js',
    'data:text/javascript,alert(1)',
    'javascript:alert(1)',
    'ftp://cdn.example.com/bundle.js',
    '/sdk/bundle.js',
    '',
  ])('rejects %s', (value) => {
    expect(SecureUrlSchema.safeParse(value).success).toBe(false);
  });
});

describe('IntegritySchema', () => {
  it('accepts what openssl prints for a sha384 digest', () => {
    const value = 'sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC';

    expect(IntegritySchema.safeParse(value).success).toBe(true);
  });

  it.each(['md5-abc', 'sha384-', 'sha384 abc', 'oqVuAfXRKap7fdgcCY5uykM6'])(
    'rejects %s',
    (value) => {
      expect(IntegritySchema.safeParse(value).success).toBe(false);
    },
  );
});
