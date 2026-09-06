import Link from 'next/link';

export default function Success() {
  return (
    <>
      <h1>Thank you</h1>
      <p id="success-message">The order is on its way.</p>
      <Link href="/cart">Back to the cart</Link>
    </>
  );
}
