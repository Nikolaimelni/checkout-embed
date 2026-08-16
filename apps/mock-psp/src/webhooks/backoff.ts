export const BASE_DELAY_MS = 1_000;
export const MAX_DELAY_MS = 5 * 60 * 1_000;
export const MAX_ATTEMPTS = 12;

/**
 * How long to wait before the next attempt, given how many have already failed. Null once
 * the delivery has been tried MAX_ATTEMPTS times and nobody is coming back for it. Twelve
 * attempts on this curve spans a little under twenty minutes, which is long enough to ride
 * out a deploy and short enough that the table does not fill with hopeless rows.
 */
export function backoffFor(failedAttempts: number): number | null {
  if (failedAttempts >= MAX_ATTEMPTS) return null;
  return Math.min(BASE_DELAY_MS * 2 ** Math.max(0, failedAttempts - 1), MAX_DELAY_MS);
}
