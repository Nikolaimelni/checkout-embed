import { z } from 'zod';

/**
 * Names the HTML spec reserves. They contain a dash but may not be used for a custom
 * element, and the registry throws rather than warns, which would take the whole widget
 * down with it.
 */
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

/**
 * A host can hand us its own components to render instead of ours. The name arrives as
 * a string from someone else's config, so it is checked here rather than at the
 * customElements.get call site.
 */
export const CustomElementNameSchema = z
  .string()
  .regex(/^[a-z][a-z0-9._]*-[a-z0-9._-]*$/, {
    error: 'expected a lowercase custom element name containing a dash',
  })
  .refine((name) => !RESERVED_NAMES.has(name), {
    error: 'this name is reserved by the HTML specification',
  });

export type CustomElementName = z.infer<typeof CustomElementNameSchema>;
