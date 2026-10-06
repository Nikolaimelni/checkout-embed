import { isCheckoutError } from '@checkout-embed/core';
import { act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountWidget, type WidgetInput, type WidgetView } from './mount.js';
import { states } from './testing/fixtures.js';
import { createTestStore, type TestStore } from './testing/store.js';

const total = { amountMinor: 1000, currency: 'EUR' } as const;

const open: WidgetView[] = [];

afterEach(() => {
  for (const view of open.splice(0)) view.unmount();
  document.body.replaceChildren();
});

function mount(
  host: Element,
  store: TestStore = createTestStore(states.methods),
): { view: WidgetView; store: TestStore; input: WidgetInput } {
  const input: WidgetInput = { store, total, onIntent: vi.fn() };
  let view!: WidgetView;
  act(() => {
    view = mountWidget(host, input);
  });
  open.push(view);
  return { view, store, input };
}

function hostElement(tag = 'div'): Element {
  const element = document.createElement(tag);
  document.body.append(element);
  return element;
}

describe('mountWidget', () => {
  it('renders into a shadow root', () => {
    const host = hostElement();

    const { view } = mount(host);

    expect(view.shadowRoot).toBe(host.shadowRoot);
    expect(view.shadowRoot.textContent).toContain('Choose how to pay');
    expect(host.textContent).toBe('');
  });

  it('keeps the stylesheet inside the shadow root and out of the document', () => {
    const host = hostElement();

    const { view } = mount(host);

    expect(view.shadowRoot.querySelector('style')?.textContent).toContain('.root');
    expect(document.head.querySelector('style')).toBeNull();
  });

  it('follows the store when the state moves on', () => {
    const host = hostElement();
    const { view, store } = mount(host);

    act(() => {
      store.set(states.succeeded);
    });

    expect(view.shadowRoot.textContent).toContain('Payment complete');
  });

  it('is idempotent', () => {
    const host = hostElement();
    const { view: first } = mount(host);

    const { view: second } = mount(host, createTestStore(states.succeeded));

    expect(second).toBe(first);
    expect(host.shadowRoot?.childElementCount).toBe(2);
    expect(first.shadowRoot.textContent).toContain('Payment complete');
  });

  it('survives the mount, unmount, mount that StrictMode performs', () => {
    const host = hostElement();
    const { view } = mount(host);

    act(() => {
      view.unmount();
    });
    const { view: again } = mount(host);

    expect(again.shadowRoot).toBe(view.shadowRoot);
    expect(again.shadowRoot.textContent).toContain('Choose how to pay');
  });

  it('leaves nothing of its own behind on unmount', () => {
    const host = hostElement();
    const { view } = mount(host);

    act(() => {
      view.unmount();
    });

    expect(view.shadowRoot.childElementCount).toBe(0);
    expect(view.shadowRoot.textContent).toBe('');
  });

  it('re-renders through the handle', () => {
    const host = hostElement();
    const { view, input } = mount(host);

    act(() => {
      view.update({ ...input, total: { amountMinor: 5000, currency: 'EUR' } });
    });

    expect(view.shadowRoot.textContent).toContain('50.00');
  });

  it('refuses an element that already carries a shadow root it did not create', () => {
    const host = hostElement();
    host.attachShadow({ mode: 'open' });

    expect(() =>
      mountWidget(host, {
        store: createTestStore(states.idle),
        total,
        onIntent: vi.fn(),
      }),
    ).toThrow(/already has a shadow root/);
  });

  it('explains itself when the element cannot host a shadow root at all', () => {
    const host = hostElement('input');

    try {
      mountWidget(host, {
        store: createTestStore(states.idle),
        total,
        onIntent: vi.fn(),
      });
      expect.unreachable('mounting into an input should have thrown');
    } catch (error) {
      expect(isCheckoutError(error)).toBe(true);
      expect((error as Error).message).toContain('cannot host a shadow root');
    }
  });
});
