import { describe, expect, it } from 'vitest';
import { CustomElementNameSchema } from './custom-element.js';

describe('CustomElementNameSchema', () => {
  it.each(['acme-button', 'shop-pay-button', 'x-a', 'my.thing-v2'])('accepts %s', (name) => {
    expect(CustomElementNameSchema.safeParse(name).success).toBe(true);
  });

  it.each([
    ['no dash', 'button'],
    ['uppercase', 'Acme-Button'],
    ['leading dash', '-acme'],
    ['leading digit', '1-acme'],
    ['empty', ''],
  ])('rejects %s', (_label, name) => {
    expect(CustomElementNameSchema.safeParse(name).success).toBe(false);
  });

  it.each(['annotation-xml', 'color-profile', 'font-face', 'missing-glyph'])(
    'rejects the reserved name %s',
    (name) => {
      // customElements.define throws on these, and an uncaught throw inside registration
      // takes the whole widget down with it.
      expect(CustomElementNameSchema.safeParse(name).success).toBe(false);
    },
  );
});
