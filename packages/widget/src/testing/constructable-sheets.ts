type StyleWindow = Window & typeof globalThis;

class StandInSheet {
  cssText = '';

  replaceSync(css: string): void {
    this.cssText = css;
  }
}

/**
 * jsdom has no constructable stylesheets, so without this the branch that uses them never
 * runs and only the fallback is ever tested. This installs the smallest surface the
 * adoption code looks at, and hands back a function that puts the environment back.
 *
 * It is a stand-in, not a polyfill: it proves the code takes the right branch and shares
 * one sheet, and says nothing about whether a real browser applies the styles. Playwright
 * answers that.
 */
export function installConstructableStyleSheets(view: StyleWindow): () => void {
  const adopted = new WeakMap<ShadowRoot, CSSStyleSheet[]>();
  const original = view.CSSStyleSheet;
  const documentPrototype = view.Document.prototype as unknown as Record<string, unknown>;
  const shadowPrototype = view.ShadowRoot.prototype as unknown as Record<string, unknown>;

  Object.defineProperty(view, 'CSSStyleSheet', {
    value: StandInSheet,
    configurable: true,
    writable: true,
  });

  // Only the feature detection reads this one.
  Object.defineProperty(documentPrototype, 'adoptedStyleSheets', {
    value: [],
    configurable: true,
    writable: true,
  });

  Object.defineProperty(shadowPrototype, 'adoptedStyleSheets', {
    configurable: true,
    get(this: ShadowRoot): CSSStyleSheet[] {
      return adopted.get(this) ?? [];
    },
    set(this: ShadowRoot, next: CSSStyleSheet[]) {
      adopted.set(this, next);
    },
  });

  return () => {
    Object.defineProperty(view, 'CSSStyleSheet', {
      value: original,
      configurable: true,
      writable: true,
    });
    delete documentPrototype['adoptedStyleSheets'];
    delete shadowPrototype['adoptedStyleSheets'];
  };
}
