import { createHmac, timingSafeEqual } from 'node:crypto';

const HEADER = 'x-checkout-signature';

export const SIGNATURE_HEADER = HEADER;

/** Five minutes each way. Long enough for a slow queue, short enough to matter. */
export const DEFAULT_TOLERANCE_SECONDS = 300;

function digest(payload: string, secret: string, timestamp: number): string {
  return createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
}

/** The timestamp is signed too, or a captured delivery could be replayed forever. */
export function signPayload(payload: string, secret: string, timestampSeconds: number): string {
  return `t=${timestampSeconds},v1=${digest(payload, secret, timestampSeconds)}`;
}

export function parseSignature(header: string): { timestamp: number; v1: string } | null {
  const parts = new Map(
    header
      .split(',')
      .map((part) => part.trim().split('='))
      .filter((pair): pair is [string, string] => pair.length === 2),
  );

  const timestamp = Number(parts.get('t'));
  const v1 = parts.get('v1');

  if (!Number.isSafeInteger(timestamp) || v1 === undefined || v1.length === 0) return null;

  return { timestamp, v1 };
}

export type VerifyOptions = {
  readonly nowSeconds: number;
  readonly toleranceSeconds?: number;
};

export function verifySignature(
  header: string,
  payload: string,
  secret: string,
  options: VerifyOptions,
): boolean {
  const parsed = parseSignature(header);
  if (!parsed) return false;

  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (Math.abs(options.nowSeconds - parsed.timestamp) > tolerance) return false;

  const expected = Buffer.from(digest(payload, secret, parsed.timestamp), 'utf8');
  const received = Buffer.from(parsed.v1, 'utf8');

  // timingSafeEqual needs equal lengths, and the length gives nothing away.
  return expected.length === received.length && timingSafeEqual(expected, received);
}
