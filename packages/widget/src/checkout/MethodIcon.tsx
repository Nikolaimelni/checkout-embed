import type { PaymentMethod } from '@checkout-embed/contracts';
import type { ReactNode } from 'react';

type Props = {
  readonly method: PaymentMethod;
};

// Drawn rather than taken from the networks' brand kits: a mark shaped like the real one is
// enough to scan a list by, and nobody's trademark ships inside the bundle.
export function MethodIcon({ method }: Props): ReactNode {
  if (method.kind === 'saved_card' && method.brand) {
    return (
      <span className="method-icon brand" aria-hidden="true">
        {method.brand.slice(0, 4).toUpperCase()}
      </span>
    );
  }

  return (
    <span className="method-icon" aria-hidden="true">
      {method.kind === 'apple_pay' || method.kind === 'google_pay' ? <Wallet /> : <Card />}
    </span>
  );
}

function Card() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" strokeWidth="1.6" />
      <path d="M3 10h18" strokeWidth="1.6" />
      <path d="M7 15h4" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function Wallet() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H18v3" strokeWidth="1.6" strokeLinejoin="round" />
      <rect x="4" y="8.5" width="16" height="10" rx="2.5" strokeWidth="1.6" />
      <circle cx="16" cy="13.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
