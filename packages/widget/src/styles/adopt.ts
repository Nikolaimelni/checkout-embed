export type StyleDisposer = () => void;

type StyleWindow = Window & typeof globalThis;

function ownerWindow(root: ShadowRoot): StyleWindow {
  return (root.ownerDocument.defaultView ?? globalThis) as StyleWindow;
}

export function supportsConstructableStyleSheets(view: StyleWindow): boolean {
  return (
    typeof view.CSSStyleSheet === 'function' &&
    'adoptedStyleSheets' in view.Document.prototype &&
    typeof view.CSSStyleSheet.prototype.replaceSync === 'function'
  );
}

const sheets = new WeakMap<StyleWindow, Map<string, CSSStyleSheet>>();

function sheetFor(view: StyleWindow, css: string): CSSStyleSheet {
  const forWindow = sheets.get(view) ?? new Map<string, CSSStyleSheet>();
  sheets.set(view, forWindow);

  const cached = forWindow.get(css);
  if (cached) return cached;

  const sheet = new view.CSSStyleSheet();
  sheet.replaceSync(css);
  forWindow.set(css, sheet);
  return sheet;
}

export function adoptViaConstructable(root: ShadowRoot, css: string): StyleDisposer {
  const sheet = sheetFor(ownerWindow(root), css);

  if (root.adoptedStyleSheets.includes(sheet)) return () => detach(root, sheet);

  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
  return () => detach(root, sheet);
}

function detach(root: ShadowRoot, sheet: CSSStyleSheet): void {
  root.adoptedStyleSheets = root.adoptedStyleSheets.filter((candidate) => candidate !== sheet);
}

export function adoptViaStyleElement(root: ShadowRoot, css: string): StyleDisposer {
  const element = root.ownerDocument.createElement('style');
  element.textContent = css;
  root.prepend(element);

  return () => element.remove();
}

export function adoptStyles(root: ShadowRoot, css: string): StyleDisposer {
  return supportsConstructableStyleSheets(ownerWindow(root))
    ? adoptViaConstructable(root, css)
    : adoptViaStyleElement(root, css);
}
