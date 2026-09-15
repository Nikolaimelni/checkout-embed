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

      // Iterate a copy: a listener is allowed to unsubscribe itself, and mutating the set
      // mid-iteration would silently skip whoever came after it.
      for (const listener of [...registered]) {
        try {
          listener(event);
        } catch (cause) {
          // A merchant's callback throwing is their bug, not a reason to abandon the
          // payment. Swallowed on purpose, reported so it is not invisible.
          logger.log('error', 'checkout: event listener threw', { event: event.type, cause });
        }
      }
    },

    on(type, listener) {
      const registered = listeners.get(type) ?? new Set<AnyListener>();
      // why: the map is keyed by event type, so the listener only ever receives events of
      // the type it registered for. TypeScript cannot see through the map to prove it.
      const erased = listener as AnyListener;
      registered.add(erased);
      listeners.set(type, registered);

      return () => {
        registered.delete(erased);
        // A second call, or one after clear(), holds a set that is no longer in the map,
        // and deleting by type would drop whoever subscribed since.
        if (registered.size === 0 && listeners.get(type) === registered) listeners.delete(type);
      };
    },

    clear() {
      listeners.clear();
    },
  };
}
