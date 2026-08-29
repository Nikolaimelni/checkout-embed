import type { StorageAdapter } from '@checkout-embed/core';

export type BrowserStorageOptions = {
  readonly view: Window;
  /** Everything this widget writes is prefixed, so a merchant's own keys stay theirs. */
  readonly namespace?: string;
  readonly warn?: (message: string) => void;
};

function usable(view: Window): Storage | null {
  try {
    const probe = '__checkout_embed_probe__';
    view.localStorage.setItem(probe, '1');
    view.localStorage.removeItem(probe);
    return view.localStorage;
  } catch {
    // Reading localStorage throws outright in Safari's private mode and wherever storage
    // is blocked by policy. Feature detection here has to be a write, not a typeof.
    return null;
  }
}

/**
 * Falls back to memory rather than failing. Losing a saved preference between reloads is
 * a worse experience; losing the payment because storage was blocked is a bug report.
 */
export function createBrowserStorage(options: BrowserStorageOptions): StorageAdapter {
  const prefix = `${options.namespace ?? 'checkout-embed'}:`;
  const store = usable(options.view);
  const memory = new Map<string, string>();

  if (store === null) {
    options.warn?.('checkout-embed: local storage is unavailable, keeping state in memory');
  }

  return {
    async read(key) {
      return store === null ? (memory.get(prefix + key) ?? null) : store.getItem(prefix + key);
    },

    async write(key, value) {
      if (store === null) {
        memory.set(prefix + key, value);
        return;
      }
      store.setItem(prefix + key, value);
    },

    async remove(key) {
      if (store === null) {
        memory.delete(prefix + key);
        return;
      }
      store.removeItem(prefix + key);
    },
  };
}
