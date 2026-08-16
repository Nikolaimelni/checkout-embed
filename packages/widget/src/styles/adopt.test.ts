import { afterEach, describe, expect, it } from 'vitest';
import { installConstructableStyleSheets } from '../testing/constructable-sheets.js';
import {
  adoptStyles,
  adoptViaConstructable,
  adoptViaStyleElement,
  supportsConstructableStyleSheets,
} from './adopt.js';

const CSS = '.root{color:#10695a}';

function shadowRoot(): ShadowRoot {
  const host = document.createElement('div');
  document.body.append(host);
  return host.attachShadow({ mode: 'open' });
}

describe('adoptViaStyleElement', () => {
  it('puts the stylesheet inside the shadow root, not in the document', () => {
    const root = shadowRoot();

    adoptViaStyleElement(root, CSS);

    expect(root.querySelector('style')?.textContent).toBe(CSS);
    expect(document.head.querySelector('style')).toBeNull();
  });

  it('puts it first, so anything the widget renders can override it', () => {
    const root = shadowRoot();
    root.append(document.createElement('div'));

    adoptViaStyleElement(root, CSS);

    expect(root.firstElementChild?.tagName).toBe('STYLE');
  });

  it('takes the stylesheet back out again', () => {
    const root = shadowRoot();

    adoptViaStyleElement(root, CSS)();

    expect(root.querySelector('style')).toBeNull();
  });
});

describe('adoptViaConstructable', () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
  });

  // Each case uses its own stylesheet text: sheets are cached per window per text, and the
  // stand-in class is replaced between cases.
  it('shares one sheet across roots and detaches it from only one', () => {
    restore = installConstructableStyleSheets(window);
    const first = shadowRoot();
    const second = shadowRoot();
    const css = '.root{color:#111}';

    const dispose = adoptViaConstructable(first, css);
    adoptViaConstructable(second, css);

    expect(first.adoptedStyleSheets[0]).toBe(second.adoptedStyleSheets[0]);

    dispose();

    expect(first.adoptedStyleSheets).toHaveLength(0);
    expect(second.adoptedStyleSheets).toHaveLength(1);
  });

  it('does not adopt the same sheet twice into one root', () => {
    restore = installConstructableStyleSheets(window);
    const root = shadowRoot();
    const css = '.root{color:#222}';

    adoptViaConstructable(root, css);
    adoptViaConstructable(root, css);

    expect(root.adoptedStyleSheets).toHaveLength(1);
  });

  it('keeps stylesheets a host already adopted', () => {
    restore = installConstructableStyleSheets(window);
    const root = shadowRoot();
    const theirs = new window.CSSStyleSheet();
    root.adoptedStyleSheets = [theirs];

    const dispose = adoptViaConstructable(root, '.root{color:#333}');

    expect(root.adoptedStyleSheets).toHaveLength(2);

    dispose();

    expect(root.adoptedStyleSheets).toEqual([theirs]);
  });
});

describe('adoptStyles', () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
  });

  it('falls back to a style element where there are no constructable sheets', () => {
    const root = shadowRoot();

    adoptStyles(root, CSS);

    expect(root.querySelector('style')?.textContent).toBe(CSS);
  });

  it('uses constructable sheets where they exist', () => {
    restore = installConstructableStyleSheets(window);
    const root = shadowRoot();

    adoptStyles(root, '.root{color:#444}');

    expect(root.adoptedStyleSheets).toHaveLength(1);
    expect(root.querySelector('style')).toBeNull();
  });

  it('is running against a jsdom that still has no constructable stylesheets', () => {
    // If this starts failing, jsdom grew support, the fallback stopped being the branch
    // component tests take, and the stand-in above is no longer earning its keep.
    expect(supportsConstructableStyleSheets(window)).toBe(false);
  });
});
