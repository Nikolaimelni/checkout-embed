import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from './events.js';
import type { Logger, LogLevel } from './logger.js';

function spyLogger(): { logger: Logger; levels: LogLevel[] } {
  const levels: LogLevel[] = [];
  return {
    levels,
    logger: {
      log(level) {
        levels.push(level);
      },
    },
  };
}

describe('createEventBus', () => {
  it('delivers only the event type a listener asked for', () => {
    const bus = createEventBus();
    const onReady = vi.fn();
    const onError = vi.fn();

    bus.on('widget:ready', onReady);
    bus.on('payment:error', onError);
    bus.emit({ type: 'widget:ready' });

    expect(onReady).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it('stops delivering after unsubscribe', () => {
    const bus = createEventBus();
    const listener = vi.fn();

    const off = bus.on('widget:ready', listener);
    off();
    bus.emit({ type: 'widget:ready' });

    expect(listener).not.toHaveBeenCalled();
  });

  it('still reaches the later listeners when an earlier one throws', () => {
    const { logger, levels } = spyLogger();
    const bus = createEventBus({ logger });
    const second = vi.fn();

    bus.on('widget:ready', () => {
      throw new Error('merchant analytics blew up');
    });
    bus.on('widget:ready', second);
    bus.emit({ type: 'widget:ready' });

    expect(second).toHaveBeenCalledOnce();
    expect(levels).toEqual(['error']);
  });

  it('finishes the round when a listener unsubscribes another one mid-emit', () => {
    const bus = createEventBus();
    const third = vi.fn();

    const off = bus.on('widget:ready', vi.fn());
    bus.on('widget:ready', () => {
      off();
    });
    bus.on('widget:ready', third);
    bus.emit({ type: 'widget:ready' });

    expect(third).toHaveBeenCalledOnce();
  });

  it('drops everything on clear', () => {
    const bus = createEventBus();
    const listener = vi.fn();

    bus.on('widget:ready', listener);
    bus.clear();
    bus.emit({ type: 'widget:ready' });

    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps a later listener when an old unsubscribe runs twice', () => {
    const bus = createEventBus();
    const later = vi.fn();

    const off = bus.on('widget:ready', vi.fn());
    off();
    bus.on('widget:ready', later);
    off();
    bus.emit({ type: 'widget:ready' });

    expect(later).toHaveBeenCalledOnce();
  });

  it('keeps a listener added after clear when an older unsubscribe runs', () => {
    const bus = createEventBus();
    const later = vi.fn();

    const off = bus.on('widget:ready', vi.fn());
    bus.clear();
    bus.on('widget:ready', later);
    off();
    bus.emit({ type: 'widget:ready' });

    expect(later).toHaveBeenCalledOnce();
  });

  it('is quiet about an event nobody listens to', () => {
    const { logger, levels } = spyLogger();
    const bus = createEventBus({ logger });

    expect(() => bus.emit({ type: 'widget:ready' })).not.toThrow();
    expect(levels).toEqual([]);
  });
});
