type StyleWindow = Window & typeof globalThis;

class StandInSheet {
  cssText = '';

  replaceSync(css: string): void {
    this.cssText = css;
  }
}

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
