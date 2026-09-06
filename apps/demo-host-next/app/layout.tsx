import type { ReactNode } from 'react';

export const metadata = { title: 'Acme Supply' };

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          font: '16px/1.6 system-ui, sans-serif',
          background: '#f6f6f4',
          color: '#1a1a18',
        }}
      >
        <main style={{ maxWidth: 640, margin: '0 auto', padding: '48px 24px 96px' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
