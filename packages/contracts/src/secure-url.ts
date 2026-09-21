import type { z } from 'zod';
import { string, url } from 'zod';

// why: URL is a global in every runtime this package runs in, but its type lives in the DOM
// lib and in @types/node, and this package depends on neither.
declare const URL: new (input: string) => { readonly protocol: string; readonly hostname: string };

const LOOPBACK: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]']);

/** https anywhere, plain http only on this machine, where the mock provider runs. */
export function isSecureUrl(value: string): boolean {
  try {
    const { protocol, hostname } = new URL(value);
    if (protocol === 'https:') return true;
    return protocol === 'http:' && (LOOPBACK.has(hostname) || hostname.endsWith('.localhost'));
  } catch {
    return false;
  }
}

/**
 * For addresses the provider hands back and the widget then loads: the bundle and the 3DS
 * page. A plain url() lets data: and http: through, and either one ends up running on the
 * merchant's page.
 */
export const SecureUrlSchema = url().refine(isSecureUrl, {
  error: 'expected an https address, or http on localhost',
});

/** A Subresource Integrity value, in the form the integrity attribute takes. */
export const IntegritySchema = string().regex(/^sha(256|384|512)-[A-Za-z0-9+/]+={0,2}$/, {
  error: 'expected sha256-, sha384- or sha512- followed by a base64 digest',
});

export type SecureUrl = z.infer<typeof SecureUrlSchema>;
