# Six things a shadow root does not do for you

I spent a few weeks building an embeddable payment widget in the open, mostly to find out
what breaks. The widget renders React into a shadow root on somebody else's page. Most of
what I read beforehand described shadow DOM as an isolation boundary and stopped there.
It is one, for the thing it isolates. The list below is what it does not isolate, and what
it costs to close each gap.

Everything here is from [checkout-embed](https://github.com/Nikolaimelni/checkout-embed),
and every claim has a test next to it.

## 1. CSS Modules cannot reach the widget at all

This is the one that stops you on day one, and it is the least interesting.

CSS Modules, styled-jsx, Tailwind's generated sheet, and every other build-time styling
approach put their output in `document.head`. A shadow root does not look at
`document.head`. Style resolution inside a shadow tree consults that tree's own stylesheets
and nothing else.

So the widget renders with its class names attached and no rules behind them, and the
first hour goes into looking for a typo in a class name.

The fix is to get the stylesheet into the shadow root as a string. I write SCSS and compile
it into a generated TypeScript module before anything else runs:

```ts
const { css } = compile('src/styles/widget.scss', { style: 'compressed' });
writeFileSync(target, `export const widgetCss = ${JSON.stringify(css)};`);
```

A bundler plugin would do the same job with less ceremony, and I still did not use one.
The same import has to work under the library build, under the test runner and under `tsc`,
and a plugin means three different mechanisms answering for one import statement. A file on
disk means one.

## 2. Constructable stylesheets are the fast path and the untested one

With the CSS in hand there are two ways to install it:

```ts
const sheet = new CSSStyleSheet();
sheet.replaceSync(css);
root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
```

or an old-fashioned `<style>` element appended to the root.

The first is better. One `CSSStyleSheet` can be adopted by every shadow root on the page,
parsed once, shared by all of them. That sharing is the entire reason the API exists, and
a widget that constructs a new sheet per instance has taken the slow path with extra steps.

The catch is that jsdom does not implement constructable stylesheets. Neither did Safari
before 16.4. So the `<style>` fallback is not a nicety for old browsers, it is the only
branch your component tests will ever execute. If you write the fast path and test in
jsdom, you have shipped an untested code path to every user you have.

I ended up writing a small stand-in that installs just enough of the API for the other
branch to run:

```ts
export function installConstructableStyleSheets(view: Window): () => void {
  const adopted = new WeakMap<ShadowRoot, CSSStyleSheet[]>();
  Object.defineProperty(view, 'CSSStyleSheet', { value: StandInSheet, configurable: true });
  Object.defineProperty(view.ShadowRoot.prototype, 'adoptedStyleSheets', {
    get() { return adopted.get(this) ?? []; },
    set(next) { adopted.set(this, next); },
    configurable: true,
  });
  return () => { /* put it all back */ };
}
```

It proves the code takes the right branch and shares one sheet between roots. It says
nothing about whether a browser applies the result, which is what the Playwright suite is
for. Being clear about which of those two questions a test answers turned out to matter
more than the test itself.

## 3. Inherited properties walk straight through the boundary

This is the one I would tell people about if I could only pick one.

Selectors from the host page cannot match anything inside the shadow tree. That much is
true and widely repeated. But inheritance is not selection. Inherited properties flow into
the shadow tree through the host element, exactly as they flow into any other child, and
the host page absolutely can set them on the host element.

Worse, a declaration carrying `!important` out in the document beats a `:host` rule inside
the shadow tree. The cascade puts important declarations from the outer document above
`:host`, so this is not a bug you can out-specify.

Which means a page containing

```css
* { color: red !important; font-family: "Comic Sans MS" !important; }
```

recolours and re-fonts your widget without ever matching one of its elements. I had written
`:host { all: initial; ... }`, felt safe, and found out otherwise by building a checkbox
into my sandbox that turns a hostile stylesheet on. Colour, font family and letter spacing
all changed inside the widget.

The fix is one line in a place that looks wrong until you think about it. The reset does not
belong on `:host`, because `:host` is the one element the page can reach. It belongs on the
first element *inside* the shadow tree:

```scss
.root {
  all: initial;
  font-family: system-ui, sans-serif;
  color: var(--ce-ink);
  /* everything else */
}
```

Nothing outside the shadow tree can select `.root`, so nothing outside can beat it. Custom
properties survive, because `all` deliberately does not reset them, which is what keeps the
theme tokens declared on `:host` working.

The end to end test for this reads the computed colour, font, letter spacing, radius and
padding of three elements inside the root, drops the hostile stylesheet on the page, and
reads them back. They have to be identical. It also asserts that the page around the widget
*did* change, because otherwise the comparison proves nothing.

## 4. Focus management libraries stop at the boundary

The widget opens a modal for the 3DS challenge, so it needs a focus trap. React Aria's
`FocusScope` is the obvious choice and it mostly works: containment is fine.

`autoFocus` is not. Opening the dialog left focus where it was. React Aria walks out from
`document.activeElement` to find the first focusable element in the scope, and for a shadow
root `document.activeElement` is the host element, not anything inside it. There is an
`enableShadowDOM` flag in `@react-stately/flags`, and in the version I was on it is not
wired to `FocusScope` at all; I checked by grepping the built package for the symbol.

Ten lines of my own solved it, and solved it better than the library would have:

```tsx
useEffect(() => {
  dialogRef.current?.focus();
}, []);
```

Focusing the dialog itself rather than the first control gets its `aria-label` read out
before the iframe takes over, which is the behaviour you want anyway.

Later the library went altogether. A native `<dialog>` opened with `showModal()` works from
inside a shadow root: it goes into the top layer, traps focus and makes the rest of the page
inert without any code of mine. It also fixed a bug I had not seen yet. The overlay was
`position: fixed`, and a `transform` on any ancestor of the merchant's container turns that
into fixed to the ancestor, clipped by its overflow. jsdom has the element but not
`showModal`, so component tests run against a four-line stand-in, and Playwright checks the
real one.

The general shape of the problem goes beyond focus. Any library that reaches for
`document.activeElement`, `document.querySelectorAll` or `event.target` without accounting
for `composedPath` and `shadowRoot` will be subtly wrong inside a shadow tree, and it will
be wrong quietly.

## 5. React's event delegation is fine, and its unmount is not

Good news first. React attaches its listeners to the container you pass `createRoot`, not
to the document, and has done since React 17. Put that container inside the shadow root and
delegation works normally. Clicks, focus events, everything. This is the part I expected to
break and it did not.

What did break was teardown. A merchant unmounting the widget does it from their own effect
cleanup:

```tsx
useEffect(() => {
  const mounted = checkout.mount(host, { amount });
  return () => mounted.unmount();
}, [host, amount]);
```

That cleanup runs while React is rendering their tree. My `unmount()` called
`root.unmount()` on the widget's own root synchronously, and React warned:

> Attempted to synchronously unmount a root while React was already rendering.

Two independent roots, one warning, and a race condition behind it. Deferring by a microtask
fixes it, and the container can still come out immediately so the shadow root is empty the
moment the call returns:

```ts
unmount() {
  disposeStyles();
  container.remove();
  queueMicrotask(() => root.unmount());
}
```

I found this because a Playwright test reads the console during three round trips through a
Next.js app. Nothing in the unit suite could have: jsdom does not run the host's render
loop and mine at the same time.

## 6. The boundary does not make the widget small

None of the above has anything to do with size, and yet the number that actually surprised
me was the bundle.

An embedded widget ships React, and React is about 45 kB gzipped before you write a line.
Fine, known, priced in. What I did not expect was the validator. The bundle came out at
163 kB gzipped and Zod was 87 kB of it, for a handful of schemas.

The cause is that `zod` exports `z` as a namespace:

```js
import * as z from "./v4/classic/external.js";
export { z, z as default };
```

`import { z } from 'zod'` therefore imports the whole namespace object, and a bundler cannot
prove which properties you touched. Every locale, both directions of JSON Schema conversion,
all of it. Named imports let it shake:

```ts
import { object, string, int } from 'zod';   // 24 kB gzipped
import { z } from 'zod';                     // 87 kB gzipped
```

The library's own source has a comment acknowledging the problem for the default export.
The named-import fix took the bundle from 163 kB to 101 kB and cost an afternoon to find,
which is most of why this section exists.
