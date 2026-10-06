import Link from 'next/link';
import { Checkout } from '../../components/Checkout';
import { pspUrl } from '../../env';

const AMOUNT = { amountMinor: 4999, currency: 'EUR' } as const;

// no next/dynamic: if this page fails to build, the SDK broke on the server
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

      <Checkout amount={AMOUNT} apiBaseUrl={pspUrl()} />

      <p style={{ marginTop: 32 }}>
        <Link href="/success" id="leave-without-paying">
          Leave without paying
        </Link>
      </p>
    </>
  );
}
