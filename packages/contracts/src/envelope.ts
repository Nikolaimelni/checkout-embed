import { z } from 'zod';
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
  return z.object({
    source: z.literal(MESSAGE_SOURCE),
    protocolVersion: z.int().positive(),
    id: z.string().min(1),
    sentAt: z.iso.datetime(),
    payload,
  });
}

export type SealOptions = {
  readonly id: string;
  readonly sentAt: string;
};

/**
 * Takes the id and the timestamp rather than making them, so this stays a pure function
 * and the caller owns the clock.
 */
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

/**
 * The order of the three checks is the whole point. Source first, so foreign traffic is
 * dropped in silence; version second, so a stale loader is refused rather than
 * misinterpreted; shape last, because it is only meaningful once the first two hold.
 */
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
    return {
      ok: false,
      reason: 'malformed',
      issues: parsed.error.issues.map(
        (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
      ),
    };
  }

  return { ok: true, value: parsed.data };
}
