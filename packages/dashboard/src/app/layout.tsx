/**
 * Root layout — AgentGuard Dashboard
 */
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import './globals.css';

/**
 * Client components (Providers, Nav) are loaded with ssr: false to avoid
 * React error #31 during static prerender of /404 and other pages.
 * The dashboard is a client-side SPA — all pages use 'use client' — so
 * server-side rendering of these wrappers is unnecessary and fragile with
 * React 19 + Next.js 15 static generation.
 */
const Providers = dynamic(() => import('./providers'), { ssr: false });
const Nav = dynamic(() => import('./nav'), { ssr: false });

export const metadata: Metadata = {
  title: 'AgentGuard — Runtime Security for AI Agents',
  description: 'Monitor, control, and audit your AI agents in real-time.',
};

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
