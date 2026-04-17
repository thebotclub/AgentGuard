/**
 * Root layout — AgentGuard Dashboard
 */
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import ClientShell from './client-shell';
import './globals.css';

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
        <ClientShell>{children}</ClientShell>
      </body>
    </html>
  );
}
