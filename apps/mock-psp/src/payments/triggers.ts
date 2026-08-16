export const OUTCOMES = ['succeed', 'decline', 'require_action', 'stall'] as const;

export type Outcome = (typeof OUTCOMES)[number];

/**
 * Trigger amounts instead of randomness. A demo you cannot steer is a demo you cannot
 * record, and a test that flips a coin is not a test.
 */
export const TRIGGERS: readonly { readonly amountMinor: number; readonly outcome: Outcome }[] = [
  { amountMinor: 1000, outcome: 'succeed' },
  { amountMinor: 1051, outcome: 'decline' },
  { amountMinor: 1003, outcome: 'require_action' },
  { amountMinor: 1099, outcome: 'stall' },
];

const BY_AMOUNT: ReadonlyMap<number, Outcome> = new Map(
  TRIGGERS.map(({ amountMinor, outcome }) => [amountMinor, outcome]),
);

export function outcomeFor(amountMinor: number): Outcome {
  return BY_AMOUNT.get(amountMinor) ?? 'succeed';
}

/** How long a confirmed payment stays in processing before it settles. */
export const SETTLE_DELAY_MS = 1_500;

/** Far enough away that the widget's poll budget runs out first, which is the point. */
export const NEVER_SETTLES_MS = 365 * 24 * 60 * 60 * 1_000;
