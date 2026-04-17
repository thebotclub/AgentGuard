/**
 * Root layout — AgentGuard Dashboard
 */
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Providers from './providers';
import Nav from './nav';
import './globals.css';

export const metadata: Metadata = {
  title: 'AgentGuard — Runtime Security for AI Agents',
  description: 'Monitor, control, and audit your AI agents in real-time.',
};

// Force dynamic rendering to skip static prerendering of /404.
// React 19 + Next.js 15 has a known issue where prerendering the
// default 404 page with client component boundaries triggers React error #31.
// All dashboard pages are 'use client' anyway, so static generation has no benefit.
export const dynamic = 'force-dynamic';

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif', background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
        {/* Skip-to-content link for keyboard users (WCAG 2.4.1) */}
        <a href="#main-content" className="skip-to-content">
          Skip to main content
        </a>
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
      </body>
    </html>
  );
}
