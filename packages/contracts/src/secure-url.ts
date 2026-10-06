import type { z } from 'zod';
import { string, url } from 'zod';

// why: URL exists at runtime everywhere, but its type lives in the DOM lib and @types/node
declare const URL: new (input: string) => { readonly protocol: string; readonly hostname: string };

const LOOPBACK: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isSecureUrl(value: string): boolean {
  try {
    const { protocol, hostname } = new URL(value);
    if (protocol === 'https:') return true;
    return protocol === 'http:' && (LOOPBACK.has(hostname) || hostname.endsWith('.localhost'));
  } catch {
    return false;
  }
}

export const SecureUrlSchema = url().refine(isSecureUrl, {
  error: 'expected an https address, or http on localhost',
});

export const IntegritySchema = string().regex(/^sha(256|384|512)-[A-Za-z0-9+/]+={0,2}$/, {
  error: 'expected sha256-, sha384- or sha512- followed by a base64 digest',
});

export type SecureUrl = z.infer<typeof SecureUrlSchema>;
