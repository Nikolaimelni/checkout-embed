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

export function sealEnvelope<TPayload>(
  payload: TPayload,
  { id, sentAt }: SealOptions,
): Envelope<TPayload> {
  return { source: MESSAGE_SOURCE, protocolVersion: PROTOCOL_VERSION, id, sentAt, payload };
}

export type EnvelopeRejection =
  | { readonly reason: 'foreign' }
  | { readonly reason: 'protocol_mismatch'; readonly received: unknown; readonly expected: number }
  | { readonly reason: 'malformed'; readonly issues: readonly string[] };

export type EnvelopeRead<TPayload> =
  | { readonly ok: true; readonly value: Envelope<TPayload> }
  | ({ readonly ok: false } & EnvelopeRejection);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

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
