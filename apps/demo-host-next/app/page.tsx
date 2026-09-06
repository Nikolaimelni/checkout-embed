import Link from 'next/link';

export default function Home() {
  return (
    <>
      <h1>Acme Supply</h1>
      <p>Server rendered, like the rest of this app.</p>
      <Link href="/cart">Go to the cart</Link>
    </>
  );
}
