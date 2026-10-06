import type { WidgetEvent } from '@checkout-embed/contracts';
import { type Logger, silentLogger } from './logger.js';

export type WidgetEventType = WidgetEvent['type'];
export type WidgetEventOf<TType extends WidgetEventType> = Extract<WidgetEvent, { type: TType }>;
export type WidgetEventListener<TType extends WidgetEventType> = (
  event: WidgetEventOf<TType>,
) => void;
export type Unsubscribe = () => void;

export type EventBus = {
  emit(event: WidgetEvent): void;
  on<TType extends WidgetEventType>(type: TType, listener: WidgetEventListener<TType>): Unsubscribe;
  clear(): void;
};

export type EventBusOptions = {
  readonly logger?: Logger;
};

type AnyListener = (event: WidgetEvent) => void;

export function createEventBus(options: EventBusOptions = {}): EventBus {
  const logger = options.logger ?? silentLogger;
  const listeners = new Map<WidgetEventType, Set<AnyListener>>();

  return {
    emit(event) {
      const registered = listeners.get(event.type);
      if (!registered) return;

      // a copy, so a listener can unsubscribe itself mid-emit
      for (const listener of [...registered]) {
        try {
          listener(event);
        } catch (cause) {
          logger.log('error', 'checkout: event listener threw', { event: event.type, cause });
        }
      }
    },

    on(type, listener) {
      const registered = listeners.get(type) ?? new Set<AnyListener>();
      // why: the map is keyed by type, so a listener only gets its own events; TS cannot see that
      const erased = listener as AnyListener;
      registered.add(erased);
      listeners.set(type, registered);

      return () => {
        registered.delete(erased);
        // after clear() or a second off() this set is stale, and deleting by type would drop newer listeners
        if (registered.size === 0 && listeners.get(type) === registered) listeners.delete(type);
      };
    },

    clear() {
      listeners.clear();
    },
  };
}
