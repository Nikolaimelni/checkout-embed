import Link from 'next/link';
import { Checkout } from '../../components/Checkout';
import { pspUrl } from '../../env';

const AMOUNT = { amountMinor: 4999, currency: 'EUR' } as const;

// Imported straight into a server component, no next/dynamic. If the SDK stops being safe
// to import on a server, this page stops building.
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
