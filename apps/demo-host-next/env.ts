import { url } from 'zod';

/**
 * The only place this app reads process.env. The cart page is a server component, so it
 * reads the value here and hands it to the widget as a prop, and nothing depends on the
 * bundler inlining a NEXT_PUBLIC_ variable into client code.
 */
export function pspUrl(): string {
  return url().parse(process.env['PSP_URL'] ?? 'http://localhost:4000');
}
