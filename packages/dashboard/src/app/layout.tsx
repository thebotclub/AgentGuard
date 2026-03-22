/**
 * Root layout — AgentGuard Dashboard
 */
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Providers from './providers';
import Nav from './nav';

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
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif', background: '#f8fafc', color: '#0f172a' }}>
        <Providers>
          <Nav />
          <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
