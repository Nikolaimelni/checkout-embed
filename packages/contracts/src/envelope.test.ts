import { describe, expect, it } from 'vitest';
import { readEnvelope, sealEnvelope } from './envelope.js';
import { MESSAGE_SOURCE, PROTOCOL_VERSION } from './protocol.js';
import { WidgetEventSchema } from './widget-event.js';

const seal = { id: 'msg_1', sentAt: '2026-09-04T10:00:00Z' } as const;

describe('readEnvelope', () => {
  it('accepts a well formed message', () => {
    const raw = sealEnvelope({ type: 'widget:ready' } as const, seal);

    const read = readEnvelope(WidgetEventSchema, raw);

    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.value.payload).toEqual({ type: 'widget:ready' });
      expect(read.value.protocolVersion).toBe(PROTOCOL_VERSION);
    }
  });

  it.each([
    ['a primitive', 42],
    ['null', null],
    ['an object from another library', { source: 'other-sdk', protocolVersion: 1 }],
    ['an object with no source at all', { protocolVersion: PROTOCOL_VERSION, payload: {} }],
  ])('treats %s as foreign traffic', (_label, raw) => {
    expect(readEnvelope(WidgetEventSchema, raw)).toEqual({ ok: false, reason: 'foreign' });
  });

  it('refuses a message from a loader on another protocol version', () => {
    const raw = { ...sealEnvelope({ type: 'widget:ready' } as const, seal), protocolVersion: 99 };

    const read = readEnvelope(WidgetEventSchema, raw);

    expect(read).toMatchObject({
      ok: false,
      reason: 'protocol_mismatch',
      received: 99,
      expected: PROTOCOL_VERSION,
    });
  });

  it('refuses a missing protocol version', () => {
    const raw = { source: MESSAGE_SOURCE, id: 'msg_1', sentAt: seal.sentAt, payload: {} };

    expect(readEnvelope(WidgetEventSchema, raw)).toMatchObject({ reason: 'protocol_mismatch' });
  });

  it('reports the offending path when the payload is the right version but the wrong shape', () => {
    const raw = sealEnvelope(
      {
        type: 'payment:success',
        intentId: 'pi_1',
        money: { amountMinor: -10, currency: 'EUR' },
      } as const,
      seal,
    );

    const read = readEnvelope(WidgetEventSchema, raw);

    expect(read.ok).toBe(false);
    if (!read.ok && read.reason === 'malformed') {
      expect(read.issues.join(' ')).toContain('payload.money.amountMinor');
    }
  });

  it('rejects an unknown payload type', () => {
    const raw = sealEnvelope({ type: 'payment:refunded' } as unknown as never, seal);

    expect(readEnvelope(WidgetEventSchema, raw)).toMatchObject({ reason: 'malformed' });
  });
});

describe('sealEnvelope', () => {
  it('stamps the current protocol version and leaves the clock to the caller', () => {
    const sealed = sealEnvelope({ type: 'widget:ready' } as const, seal);

    expect(sealed).toEqual({
      source: MESSAGE_SOURCE,
      protocolVersion: PROTOCOL_VERSION,
      id: 'msg_1',
      sentAt: '2026-09-04T10:00:00Z',
      payload: { type: 'widget:ready' },
    });
  });
});
