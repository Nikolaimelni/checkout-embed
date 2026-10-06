'use client';

import type { Money } from '@checkout-embed/contracts';
import { init } from '@checkout-embed/sdk';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Props = {
  readonly amount: Money;
  readonly apiBaseUrl: string;
};

export function Checkout({ amount, apiBaseUrl }: Props) {
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
    };
  }, [host, amount, apiBaseUrl, router]);

  return <div id="checkout" ref={setHost} />;
}
