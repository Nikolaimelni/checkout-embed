import type { Money } from '@checkout-embed/contracts';
import { CheckoutError, type CheckoutState } from '@checkout-embed/core';
import { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { CheckoutView, type HostComponents, type HostState } from './checkout/CheckoutView.js';
import type { WidgetIntent } from './checkout/intents.js';
import type { Labels } from './checkout/labels.js';
import { adoptStyles } from './styles/adopt.js';
import { widgetCss } from './styles/widget.generated.js';

export type WidgetStore = {
  getState(): CheckoutState;
  subscribe(listener: () => void): () => void;
};

export type WidgetInput = {
  readonly store: WidgetStore;
  readonly total: Money;
  readonly locale?: string | undefined;
  readonly labels?: Partial<Labels> | undefined;
  readonly components?: HostComponents | undefined;
  readonly host?: HostState | undefined;
  readonly onIntent: (intent: WidgetIntent) => void;
};

export type WidgetView = {
  readonly shadowRoot: ShadowRoot;
  update(input: WidgetInput): void;
  unmount(): void;
};

type Instance = {
  readonly view: WidgetView;
  render(input: WidgetInput): void;
};

const instances = new WeakMap<Element, Instance>();

/** Shadow roots cannot be detached, so a host we have mounted before keeps the one it has. */
const ourRoots = new WeakMap<Element, ShadowRoot>();

type Props = {
  readonly input: WidgetInput;
};

function Mounted({ input }: Props) {
  const state = useSyncExternalStore(
    input.store.subscribe,
    input.store.getState,
    input.store.getState,
  );

  return (
    <CheckoutView
      state={state}
      total={input.total}
      locale={input.locale ?? 'en'}
      labels={input.labels}
      components={input.components}
      host={input.host}
      onIntent={input.onIntent}
    />
  );
}

function shadowFor(host: Element): ShadowRoot {
  const ours = ourRoots.get(host);
  if (ours) return ours;

  if (host.shadowRoot !== null) {
    throw new CheckoutError(
      'invalid_config',
      `<${host.localName}> already has a shadow root that the widget did not create.`,
    );
  }

  try {
    const created = host.attachShadow({ mode: 'open' });
    ourRoots.set(host, created);
    return created;
  } catch (cause) {
    // Translated, not logged and rethrown: an <input> or an <img> cannot host a shadow
    // root, and a merchant who passed the wrong element deserves better than
    // NotSupportedError with no context.
    throw new CheckoutError(
      'invalid_config',
      `<${host.localName}> cannot host a shadow root. Mount into a plain element such as a div.`,
      { cause },
    );
  }
}

/**
 * Idempotent by design rather than by guard clause. React StrictMode runs effects twice in
 * development, and a merchant calling mount from an effect is the normal case, not the
 * pathological one: the second call updates the instance that exists instead of building a
 * second widget behind the first.
 */
export function mountWidget(host: Element, input: WidgetInput): WidgetView {
  const existing = instances.get(host);
  if (existing) {
    existing.render(input);
    return existing.view;
  }

  const shadowRoot = shadowFor(host);
  const disposeStyles = adoptStyles(shadowRoot, widgetCss);
  const container = shadowRoot.ownerDocument.createElement('div');
  shadowRoot.append(container);

  const root = createRoot(container);

  const view: WidgetView = {
    shadowRoot,
    update(next) {
      instances.get(host)?.render(next);
    },
    unmount() {
      instances.delete(host);
      root.unmount();
      disposeStyles();
      container.remove();
    },
  };

  const instance: Instance = {
    view,
    render(next) {
      root.render(<Mounted input={next} />);
    },
  };

  instances.set(host, instance);
  instance.render(input);

  return view;
}
