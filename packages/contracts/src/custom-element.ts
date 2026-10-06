import type { z } from 'zod';
import { string } from 'zod';

const RESERVED_NAMES: ReadonlySet<string> = new Set([
  'annotation-xml',
  'color-profile',
  'font-face',
  'font-face-src',
  'font-face-uri',
  'font-face-format',
  'font-face-name',
  'missing-glyph',
]);

export const CustomElementNameSchema = string()
  .regex(/^[a-z][a-z0-9._]*-[a-z0-9._-]*$/, {
    error: 'expected a lowercase custom element name containing a dash',
  })
  .refine((name) => !RESERVED_NAMES.has(name), {
    error: 'this name is reserved by the HTML specification',
  });

export type CustomElementName = z.infer<typeof CustomElementNameSchema>;
