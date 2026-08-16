import type { CheckoutState } from '@checkout-embed/core';
import type { WidgetStore } from '../mount.js';

export type TestStore = WidgetStore & { set(next: CheckoutState): void };

export function createTestStore(initial: CheckoutState): TestStore {
  let state = initial;
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(next) {
      state = next;
      for (const listener of listeners) listener();
    },
  };
}
