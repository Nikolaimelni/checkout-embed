import { url } from 'zod';

export function pspUrl(): string {
  return url().parse(process.env['PSP_URL'] ?? 'http://localhost:4000');
}
