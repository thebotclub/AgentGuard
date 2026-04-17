'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';

const Providers = dynamic(() => import('./providers'), { ssr: false });
const Nav = dynamic(() => import('./nav'), { ssr: false });

export default function ClientShell({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <Nav />
      <main
        id="main-content"
        tabIndex={-1}
        style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}
      >
        {children}
      </main>
    </Providers>
  );
}
