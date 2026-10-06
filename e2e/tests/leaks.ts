import type { Page } from '@playwright/test';

export type Outstanding = {
  readonly timers: number;
  readonly listeners: number;
  readonly nodes: number;
};

export const INSTRUMENT = `
  (() => {
    const state = { timers: new Set(), listeners: 0 };
    window.__leakProbe = state;

    const originalTimeout = window.setTimeout.bind(window);
    window.setTimeout = (handler, delay, ...rest) => {
      const id = originalTimeout((...args) => {
        state.timers.delete(id);
        if (typeof handler === 'function') handler(...args);
      }, delay, ...rest);
      state.timers.add(id);
      return id;
    };

    const originalInterval = window.setInterval.bind(window);
    window.setInterval = (handler, delay, ...rest) => {
      const id = originalInterval(handler, delay, ...rest);
      state.timers.add(id);
      return id;
    };

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
