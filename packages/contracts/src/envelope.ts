import type { z } from 'zod';
import { int, iso, literal, object, string } from 'zod';
import { describeIssues } from './issues.js';
import { MESSAGE_SOURCE, PROTOCOL_VERSION } from './protocol.js';

export type Envelope<TPayload> = {
  readonly source: typeof MESSAGE_SOURCE;
  readonly protocolVersion: number;
  readonly id: string;
  readonly sentAt: string;
  readonly payload: TPayload;
};

export function envelopeOf<TPayload>(
  payload: z.ZodType<TPayload>,
): z.ZodType<Envelope<TPayload>, unknown> {
  return object({
    source: literal(MESSAGE_SOURCE),
    protocolVersion: int().positive(),
    id: string().min(1),
    sentAt: iso.datetime(),
    payload,
  });
}

export type SealOptions = {
  readonly id: string;
  readonly sentAt: string;
};

/** The caller supplies the id and the clock, so this stays pure. */
export function sealEnvelope<TPayload>(
  payload: TPayload,
  { id, sentAt }: SealOptions,
): Envelope<TPayload> {
  return { source: MESSAGE_SOURCE, protocolVersion: PROTOCOL_VERSION, id, sentAt, payload };
}

export type EnvelopeRejection =
  /** Someone else's message on a shared channel. Not an error, and not worth a log line. */
  | { readonly reason: 'foreign' }
  /** Ours, but from a loader we cannot talk to. Worth a log line and nothing else. */
  | { readonly reason: 'protocol_mismatch'; readonly received: unknown; readonly expected: number }
  /** Ours, right version, wrong shape. Someone shipped a bug, ours or theirs. */
  | { readonly reason: 'malformed'; readonly issues: readonly string[] };

export type EnvelopeRead<TPayload> =
  | { readonly ok: true; readonly value: Envelope<TPayload> }
  | ({ readonly ok: false } & EnvelopeRejection);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Source, version, shape, in that order: foreign traffic is dropped silently, and a stale
 * loader is refused before its payload is read. */
export function readEnvelope<TPayload>(
  payloadSchema: z.ZodType<TPayload>,
  raw: unknown,
): EnvelopeRead<TPayload> {
  if (!isRecord(raw) || raw['source'] !== MESSAGE_SOURCE) {
    return { ok: false, reason: 'foreign' };
  }

  if (raw['protocolVersion'] !== PROTOCOL_VERSION) {
    return {
      ok: false,
      reason: 'protocol_mismatch',
      received: raw['protocolVersion'],
      expected: PROTOCOL_VERSION,
    };
  }

  const parsed = envelopeOf(payloadSchema).safeParse(raw);
  if (!parsed.success) {
    return { ok: false, reason: 'malformed', issues: describeIssues(parsed.error) };
  }

  return { ok: true, value: parsed.data };
}
