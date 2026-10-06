import { PROTOCOL_VERSION } from '@checkout-embed/contracts';
import {
  CheckoutError,
  type WidgetEventListener,
  type WidgetEventType,
} from '@checkout-embed/core';
import {
  type CheckoutInstance,
  type CheckoutOptions,
  type HostUpdate,
  init,
  type MountOptions,
} from '../lifecycle/instance.js';
import { DEFAULT_GLOBAL_NAME, type QueueStub, readSlot, writeSlot } from '../loader/boot.js';

export type DrainOptions = {
  readonly view: Window;
  readonly globalName?: string;
  readonly warn?: (message: string) => void;
};

export type CommandRunner = {
  readonly instance: () => CheckoutInstance | null;
  readonly call: (args: readonly unknown[]) => void;
};

function isTarget(value: unknown): value is Element | string {
  return typeof value === 'string' || value instanceof Element;
}

export function createCommandRunner(warn: (message: string) => void): CommandRunner {
  let current: CheckoutInstance | null = null;

  const need = (): CheckoutInstance => {
    if (current === null) {
      throw new CheckoutError('invalid_config', 'Call init() before anything else.');
    }
    return current;
  };

  return {
    instance: () => current,

    call(args) {
      const [name, ...rest] = args;

      switch (name) {
        case 'init':
          current = init(rest[0] as CheckoutOptions);
          return;

        case 'mount': {
          if (!isTarget(rest[0])) {
            throw new CheckoutError(
              'invalid_message',
              'mount() needs an element or a selector as its first argument.',
            );
          }
          need().mount(rest[0], rest[1] as MountOptions);
          return;
        }

        case 'on': {
          if (typeof rest[0] !== 'string' || typeof rest[1] !== 'function') {
            throw new CheckoutError('invalid_message', 'on() needs an event name and a function.');
          }
          need().on(rest[0] as WidgetEventType, rest[1] as WidgetEventListener<WidgetEventType>);
          return;
        }

        case 'update':
          need().update(rest[0] as HostUpdate);
          return;

        case 'terminate':
          current?.terminate();
          current = null;
          return;

        default:
          warn(`checkout-embed: ignoring the unknown command ${String(name)}`);
      }
    },
  };
}

export function drainQueue(options: DrainOptions): CheckoutInstance | null {
  const { view } = options;
  const globalName = options.globalName ?? DEFAULT_GLOBAL_NAME;
  const warn = options.warn ?? ((message: string) => console.warn(message));

  const stub = readSlot(view, globalName) as QueueStub | undefined;
  if (typeof stub !== 'function') return null;

  const runner = createCommandRunner(warn);
  const queued = stub.q ?? [];

  if (stub.v !== PROTOCOL_VERSION) {
    warn(
      `checkout-embed: the loader on this page speaks protocol ${String(stub.v)} and this bundle speaks ${PROTOCOL_VERSION}. ` +
        `${queued.length} queued call${queued.length === 1 ? '' : 's'} were dropped. Refresh the loader tag.`,
    );
  } else {
    for (const args of queued) {
      try {
        runner.call(args);
      } catch (cause) {
        warn(`checkout-embed: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
    }
  }

  const live: QueueStub = (...args: unknown[]) => {
    runner.call(args);
  };
  live.q = [];
  live.v = PROTOCOL_VERSION;
  writeSlot(view, globalName, live);

  return runner.instance();
}

export function bootstrap(view: Window = window): CheckoutInstance | null {
  const script = view.document.querySelector<HTMLScriptElement>(
    'script[data-checkout-embed-global]',
  );

  return drainQueue({
    view,
    globalName: script?.dataset['checkoutEmbedGlobal'] ?? DEFAULT_GLOBAL_NAME,
  });
}
