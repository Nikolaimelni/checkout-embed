'use client';

import type { Money } from '@checkout-embed/contracts';
import { init } from '@checkout-embed/sdk';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Props = {
  readonly amount: Money;
};

const CONFIG = {
  merchantKey: 'mk_test_acme',
  environment: 'sandbox',
  apiBaseUrl: process.env['NEXT_PUBLIC_PSP_URL'] ?? 'http://localhost:4000',
} as const;

/**
 * The whole point of this app. The widget owns a shadow root and a React root of its own,
 * neither of which Next knows about, so the cleanup below is the only thing standing
 * between a client side navigation and a widget that outlives its page.
 */
export function Checkout({ amount }: Props) {
  // State rather than a ref: the effect has to run again if React hands it a different
  // node, and a ref would not tell it.
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!host) return;

    const checkout = init({
      config: CONFIG,
      auth: { getToken: async () => 'demo-token' },
    });

    const stopListening = checkout.on('payment:success', () => {
      router.push('/success');
    });
    const mounted = checkout.mount(host, { amount });

    return () => {
      stopListening();
      mounted.unmount();
      // Deliberately not terminate(). The instance is shared per merchant key, and this
      // component has no business ending it for anyone else on the page.
    };
  }, [host, amount, router]);

  return <div id="checkout" ref={setHost} />;
}
