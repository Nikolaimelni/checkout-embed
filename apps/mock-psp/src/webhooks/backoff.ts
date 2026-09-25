export const BASE_DELAY_MS = 1_000;
export const MAX_DELAY_MS = 5 * 60 * 1_000;
export const MAX_ATTEMPTS = 12;

/** Delay before the next attempt, or null after MAX_ATTEMPTS. Twelve span about 18 minutes. */
export function backoffFor(failedAttempts: number): number | null {
  if (failedAttempts >= MAX_ATTEMPTS) return null;
  return Math.min(BASE_DELAY_MS * 2 ** Math.max(0, failedAttempts - 1), MAX_DELAY_MS);
}
