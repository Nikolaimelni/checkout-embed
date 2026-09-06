import type { Page } from '@playwright/test';

export type Outstanding = {
  readonly timers: number;
  readonly listeners: number;
  readonly nodes: number;
};

/**
 * Counting what the widget leaves behind needs the counters in place before any of its
 * code runs, so this goes in as an init script rather than an evaluate.
 *
 * It watches window and document only. Listeners on nodes inside the shadow root go away
 * with the nodes; the ones that outlive a teardown are always the ones attached to
 * something the widget does not own.
 */
export const INSTRUMENT = `
  (() => {
    const state = { timers: new Set(), listeners: 0 };
    window.__leakProbe = state;

    for (const kind of ['setTimeout', 'setInterval']) {
      const original = window[kind].bind(window);
      window[kind] = (handler, delay, ...rest) => {
        const id = original(handler, delay, ...rest);
        state.timers.add(id);
        return id;
      };
    }

    for (const kind of ['clearTimeout', 'clearInterval']) {
      const original = window[kind].bind(window);
      window[kind] = (id) => {
        state.timers.delete(id);
        return original(id);
      };
    }

    for (const target of [window, document]) {
      const add = target.addEventListener.bind(target);
      const remove = target.removeEventListener.bind(target);
      target.addEventListener = (...args) => {
        state.listeners += 1;
        return add(...args);
      };
      target.removeEventListener = (...args) => {
        state.listeners -= 1;
        return remove(...args);
      };
    }
  })();
`;

export async function outstanding(page: Page, selector: string): Promise<Outstanding> {
  return page.evaluate((target) => {
    const probe = (window as unknown as { __leakProbe: { timers: Set<number>; listeners: number } })
      .__leakProbe;
    const host = document.querySelector(target);

    return {
      timers: probe.timers.size,
      listeners: probe.listeners,
      nodes: host?.shadowRoot?.childElementCount ?? 0,
    };
  }, selector);
}
