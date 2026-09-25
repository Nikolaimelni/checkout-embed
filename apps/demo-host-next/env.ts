import { url } from 'zod';

/** Read on the server and passed down as a prop, so nothing relies on NEXT_PUBLIC_ inlining. */
export function pspUrl(): string {
  return url().parse(process.env['PSP_URL'] ?? 'http://localhost:4000');
}
