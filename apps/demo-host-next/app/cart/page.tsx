import Link from 'next/link';
import { Checkout } from '../../components/Checkout';

const AMOUNT = { amountMinor: 4999, currency: 'EUR' } as const;

/**
 * A server component that renders a client one, with no dynamic import and no ssr: false.
 * That is deliberate. The SDK has to be safe to import on a server, and reaching for
 * next/dynamic would hide the day it stops being: this page failing to build is the test.
 */
export default function Cart() {
  return (
    <>
      <h1>Cart</h1>
      <p>
        This page is server rendered. The widget below is not, and it comes back out when you
        navigate away.
      </p>

      <p>
        <strong>Total: &euro;49.99</strong>
      </p>

      <Checkout amount={AMOUNT} />

      <p style={{ marginTop: 32 }}>
        <Link href="/success" id="leave-without-paying">
          Leave without paying
        </Link>
      </p>
    </>
  );
}
