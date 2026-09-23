import {
  type CheckoutConfig,
  type CheckoutConfigInput,
  CheckoutConfigSchema,
  describeIssues,
  HostMessageSchema,
  type MerchantKey,
  type Money,
  type PaymentMethodId,
  type RemoteWidgetConfig,
} from '@checkout-embed/contracts';
import {
  type AuthAdapter,
  CheckoutError,
  createEventBus,
  type EventBus,
  type Logger,
  silentLogger,
  type Unsubscribe,
  type WidgetEventListener,
  type WidgetEventType,
} from '@checkout-embed/core';
import {
  type HostState,
  type Labels,
  mountWidget,
  type WidgetInput,
  type WidgetView,
} from '@checkout-embed/widget';
import { createFetchHttp } from '../adapters/http-fetch.js';
import { type CheckoutApi, createCheckoutApi } from '../checkout/client.js';
import { type CheckoutController, createCheckoutController } from '../checkout/controller.js';

export type CheckoutOptions = {
  readonly config: CheckoutConfigInput;
  /** The merchant owns authentication. We ask for a token and never keep one. */
  readonly auth: AuthAdapter;
  readonly logger?: Logger | undefined;
  readonly fetchImpl?: typeof fetch;
  readonly view?: Window;
};

export type MountOptions = {
  readonly amount: Money;
  readonly preselectedMethodId?: PaymentMethodId | undefined;
  readonly labels?: Partial<Labels> | undefined;
};

export type MountHandle = {
  unmount(): void;
};

export type HostUpdate = {
  readonly balance?: Money | null;
  readonly limits?: { readonly minMinor: number; readonly maxMinor: number } | null;
  readonly blockingMessage?: string | null;
};

export type CheckoutInstance = {
  readonly merchantKey: MerchantKey;
  readonly config: CheckoutConfig;
  mount(target: Element | string, options: MountOptions): MountHandle;
  update(patch: HostUpdate): void;
  on<TType extends WidgetEventType>(type: TType, listener: WidgetEventListener<TType>): Unsubscribe;
  terminate(): void;
};

type Mounted = {
  readonly view: WidgetView;
  readonly controller: CheckoutController;
  input: WidgetInput;
};

function tearDown(mounted: Mounted): void {
  mounted.controller.dispose();
  mounted.view.unmount();
}

const EMPTY_HOST: HostState = { balance: null, limits: null, blockingMessage: null };

/**
 * One instance per merchant key, shared by everyone who asks for it. Two components on the
 * same page both calling init is the normal case, and each getting its own event bus and
 * its own token fetch is not what either of them meant.
 */
const instances = new Map<MerchantKey, CheckoutInstance>();

function resolveTarget(view: Window, target: Element | string): Element {
  if (typeof target !== 'string') return target;

  const found = view.document.querySelector(target);
  if (found === null) {
    throw new CheckoutError('invalid_config', `Nothing on the page matches ${target}.`);
  }

  return found;
}

/**
 * One method list per instance. Without this every mount, and every Close, asked the
 * provider again for the same answer. A failed load is dropped so Try again really retries.
 */
function cachingConfig(api: CheckoutApi): CheckoutApi {
  let config: Promise<RemoteWidgetConfig> | null = null;

  return {
    ...api,
    // No signal: the request is shared, and one widget going away must not cancel it for
    // the others waiting on it.
    loadConfig(merchantKey) {
      config ??= api.loadConfig(merchantKey).catch((cause: unknown) => {
        config = null;
        throw cause;
      });
      return config;
    },
  };
}

function parseConfig(input: CheckoutConfigInput): CheckoutConfig {
  const parsed = CheckoutConfigSchema.safeParse(input);

  if (!parsed.success) {
    const detail = describeIssues(parsed.error).join('; ');
    throw new CheckoutError('invalid_config', `The checkout config is not usable: ${detail}`);
  }

  return parsed.data;
}

export function init(options: CheckoutOptions): CheckoutInstance {
  const config = parseConfig(options.config);
  const existing = instances.get(config.merchantKey);

  if (existing) {
    if (JSON.stringify(existing.config) !== JSON.stringify(config)) {
      options.logger?.log('warn', 'checkout: init() returned the instance that already exists', {
        merchantKey: config.merchantKey,
        why: 'one instance per merchant key keeps its first config until terminate()',
      });
    }
    return existing;
  }

  const view = options.view ?? window;
  const logger = options.logger ?? silentLogger;
  const events: EventBus = createEventBus({ logger });
  const api = cachingConfig(
    createCheckoutApi(
      createFetchHttp({
        baseUrl: config.apiBaseUrl,
        auth: options.auth,
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      }),
    ),
  );

  const mounts = new Map<Element, Mounted>();
  let host: HostState = EMPTY_HOST;
  let terminated = false;

  function refuseIfTerminated(): void {
    if (terminated) {
      throw new CheckoutError('invalid_config', 'This checkout instance has been terminated.');
    }
  }

  const instance: CheckoutInstance = {
    merchantKey: config.merchantKey,
    config,

    mount(target, mountOptions) {
      refuseIfTerminated();

      const element = resolveTarget(view, target);
      const controller = createCheckoutController({
        api,
        merchantKey: config.merchantKey,
        total: mountOptions.amount,
        events,
        logger,
        preselectedMethodId: mountOptions.preselectedMethodId,
      });

      const input: WidgetInput = {
        store: controller,
        total: mountOptions.amount,
        locale: config.locale,
        components: config.components,
        host,
        onIntent: (intent) => controller.handle(intent),
        ...(mountOptions.labels ? { labels: mountOptions.labels } : {}),
      };

      // A second mount into the same element is the same widget with a new controller:
      // mountWidget renders into the root it already has, and the old controller is stopped
      // here rather than left loading and polling behind a view that no longer reads it.
      const previous = mounts.get(element);
      const mounted: Mounted = { view: mountWidget(element, input), controller, input };
      previous?.controller.dispose();

      mounts.set(element, mounted);
      controller.start();
      events.emit({ type: 'widget:ready' });

      return {
        unmount() {
          if (mounts.get(element) !== mounted) return;
          mounts.delete(element);
          tearDown(mounted);
        },
      };
    },

    update(patch) {
      refuseIfTerminated();

      // A patch: whatever it leaves out keeps its current value. Validated on the way in
      // even though it never leaves the process, because a limit that arrived as a string
      // would disable the pay button for reasons nobody could explain.
      const parsed = HostMessageSchema.safeParse({ type: 'host/update', ...host, ...patch });

      if (!parsed.success || parsed.data.type !== 'host/update') {
        throw new CheckoutError(
          'invalid_message',
          'update() was given something the host protocol does not allow.',
          { cause: parsed.success ? undefined : parsed.error },
        );
      }

      const { type: _type, ...next } = parsed.data;
      host = next;

      for (const mounted of mounts.values()) {
        mounted.input = { ...mounted.input, host };
        mounted.view.update(mounted.input);
      }
    },

    on(type, listener) {
      return events.on(type, listener);
    },

    terminate() {
      if (terminated) return;
      terminated = true;

      for (const mounted of mounts.values()) tearDown(mounted);
      mounts.clear();
      events.clear();
      instances.delete(config.merchantKey);
    },
  };

  instances.set(config.merchantKey, instance);
  return instance;
}

/** Drops every cached instance. Exists for tests and for a host page tearing itself down. */
export function terminateAll(): void {
  for (const instance of [...instances.values()]) instance.terminate();
}
