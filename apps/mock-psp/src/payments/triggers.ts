export const OUTCOMES = ['succeed', 'decline', 'require_action', 'stall'] as const;

export type Outcome = (typeof OUTCOMES)[number];

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

export const SETTLE_DELAY_MS = 1_500;

export const NEVER_SETTLES_MS = 365 * 24 * 60 * 60 * 1_000;
