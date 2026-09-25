import type { z } from 'zod';
import { string } from 'zod';

/** Names the spec reserves. They contain a dash, and customElements.define throws on them. */
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

/** Checked here because the name comes from someone else's config. */
export const CustomElementNameSchema = string()
  .regex(/^[a-z][a-z0-9._]*-[a-z0-9._-]*$/, {
    error: 'expected a lowercase custom element name containing a dash',
  })
  .refine((name) => !RESERVED_NAMES.has(name), {
    error: 'this name is reserved by the HTML specification',
  });

export type CustomElementName = z.infer<typeof CustomElementNameSchema>;
