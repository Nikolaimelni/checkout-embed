'use client';

import type { Money } from '@checkout-embed/contracts';
import { init } from '@checkout-embed/sdk';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Props = {
  readonly amount: Money;
  readonly apiBaseUrl: string;
};

// Next knows nothing about the widget's shadow root or its React root, so the cleanup
// below is what takes it out on client navigation.
export function Checkout({ amount, apiBaseUrl }: Props) {
  // State, not a ref, so the effect runs again when React hands it a different node.
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!host) return;

    const checkout = init({
      config: { merchantKey: 'mk_test_acme', environment: 'sandbox', apiBaseUrl },
      auth: { getToken: async () => 'demo-token' },
    });

    const stopListening = checkout.on('payment:success', () => {
      router.push('/success');
    });
    const mounted = checkout.mount(host, { amount });

    return () => {
      stopListening();
      mounted.unmount();
      // Not terminate(): the instance is shared by everyone using this merchant key.
    };
  }, [host, amount, apiBaseUrl, router]);

  return <div id="checkout" ref={setHost} />;
}
