export type Labels = {
  readonly heading: string;
  readonly loading: string;
  readonly chooseMethod: string;
  readonly pay: string;
  readonly back: string;
  readonly confirming: string;
  readonly challengeTitle: string;
  readonly challengeHint: string;
  readonly challengeDone: string;
  readonly challengeCancel: string;
  readonly polling: string;
  readonly succeeded: string;
  readonly failed: string;
  readonly retry: string;
  readonly close: string;
  readonly outsideLimits: string;
  readonly secured: string;
};

export const DEFAULT_LABELS: Labels = {
  heading: 'Payment',
  loading: 'Loading payment methods',
  chooseMethod: 'Choose how to pay',
  pay: 'Pay',
  back: 'Back',
  confirming: 'Talking to your bank',
  challengeTitle: 'Your bank needs to confirm this payment',
  challengeHint: 'Finish the check in the window below.',
  challengeDone: 'I have finished',
  challengeCancel: 'Cancel',
  polling: 'Waiting for confirmation',
  succeeded: 'Payment complete',
  failed: 'The payment did not go through',
  retry: 'Try again',
  close: 'Close',
  outsideLimits: 'This amount is outside the limits on your account.',
  secured: 'Card details go straight to the payment provider.',
};
